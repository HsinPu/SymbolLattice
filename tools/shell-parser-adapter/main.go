package main

import (
	"bytes"
	"encoding/json"
	"unicode/utf8"

	"mvdan.cc/sh/v3/syntax"
)

type errorCode uint32

const (
	codeOK errorCode = iota
	codeInvalidDialect
	codeInvalidUTF8
	codeNUL
	codeSourceLimit
	codeLineLimit
	codeParseError
	codeFunctionLimit
	codeNestingLimit
	codeUnexpectedAST
	codeInternal
)

const (
	abiVersionValue  = 2
	maxSourceBytes   = 65_536
	maxPhysicalLines = 4_096
	maxRootFunctions = 512
	maxNesting       = 128
)

type functionFact struct {
	Name      string `json:"name"`
	Form      string `json:"form"`
	DeclStart uint32 `json:"declStart"`
	DeclEnd   uint32 `json:"declEnd"`
	NameStart uint32 `json:"nameStart"`
	NameEnd   uint32 `json:"nameEnd"`
	BodyStart uint32 `json:"bodyStart"`
	BodyEnd   uint32 `json:"bodyEnd"`
}

type callFact struct {
	SourceFunctionIndex uint32   `json:"sourceFunctionIndex"`
	TargetFunctionIndex uint32   `json:"targetFunctionIndex"`
	Name                string   `json:"name"`
	Start               uint32   `json:"start"`
	End                 uint32   `json:"end"`
	CandidateIndexes    []uint32 `json:"candidateFunctionIndexes"`
	ParserProvenance    string   `json:"parserProvenance"`
}

type response struct {
	Code      errorCode      `json:"code"`
	Functions []functionFact `json:"functions"`
	Calls     []callFact     `json:"calls"`
}

var (
	inputBuffer  []byte
	resultBuffer []byte
	zeroByte     byte
)

//export abiVersion
func abiVersion() uint32 {
	return abiVersionValue
}

//export wasmAlloc
func wasmAlloc(size uint32) *byte {
	inputBuffer = make([]byte, int(size))
	if len(inputBuffer) == 0 {
		return &zeroByte
	}
	return &inputBuffer[0]
}

//export resultSize
func resultSize() uint32 {
	return uint32(len(resultBuffer))
}

//export process
func process(size uint32, dialect uint32) *byte {
	if uint64(size) > uint64(len(inputBuffer)) {
		return encodeResponse(codeInternal, nil, nil)
	}
	source := inputBuffer[:int(size):int(size)]
	if dialect != 1 && dialect != 2 {
		return encodeResponse(codeInvalidDialect, nil, nil)
	}
	if len(source) > maxSourceBytes {
		return encodeResponse(codeSourceLimit, nil, nil)
	}
	if !utf8.Valid(source) {
		return encodeResponse(codeInvalidUTF8, nil, nil)
	}
	if bytes.IndexByte(source, 0) >= 0 {
		return encodeResponse(codeNUL, nil, nil)
	}
	if physicalLineCount(source) > maxPhysicalLines {
		return encodeResponse(codeLineLimit, nil, nil)
	}

	variant := syntax.LangPOSIX
	if dialect == 2 {
		variant = syntax.LangBash
	}
	// Deliberately omit RecoverErrors and StopAt. Their zero values are part of
	// this ABI: one whole-file parse either succeeds or returns codeParseError.
	file, err := syntax.NewParser(syntax.Variant(variant)).Parse(bytes.NewReader(source), "")
	if err != nil {
		return encodeResponse(codeParseError, nil, nil)
	}
	if exceedsNestingLimit(file) {
		return encodeResponse(codeNestingLimit, nil, nil)
	}

	functions := make([]functionFact, 0)
	for _, stmt := range file.Stmts {
		decl, ok := stmt.Cmd.(*syntax.FuncDecl)
		if !ok {
			continue
		}
		if decl.Name == nil || len(decl.Names) != 0 || (!decl.RsrvWord && !decl.Parens) {
			return encodeResponse(codeUnexpectedAST, nil, nil)
		}
		form := "posix-parens"
		if decl.RsrvWord && decl.Parens {
			form = "bash-function-parens"
		} else if decl.RsrvWord {
			form = "bash-function"
		}
		functions = append(functions, functionFact{
			Name:      decl.Name.Value,
			Form:      form,
			DeclStart: uint32(decl.Pos().Offset()),
			DeclEnd:   uint32(decl.End().Offset()),
			NameStart: uint32(decl.Name.Pos().Offset()),
			NameEnd:   uint32(decl.Name.End().Offset()),
			BodyStart: uint32(decl.Body.Pos().Offset()),
			BodyEnd:   uint32(decl.Body.End().Offset()),
		})
		if len(functions) > maxRootFunctions {
			return encodeResponse(codeFunctionLimit, nil, nil)
		}
	}
	calls, safe := directFunctionCalls(file, functions, source)
	if !safe {
		calls = nil
	}
	return encodeResponse(codeOK, functions, calls)
}

func directFunctionCalls(file *syntax.File, functions []functionFact, source []byte) ([]callFact, bool) {
	indexes := make(map[string][]uint32)
	for index, function := range functions {
		indexes[function.Name] = append(indexes[function.Name], uint32(index))
	}
	safe := true
	syntax.Walk(file, func(node syntax.Node) bool {
		if node == nil || !safe {
			return safe
		}
		if declaration, ok := node.(*syntax.FuncDecl); ok {
			isRoot := false
			for _, statement := range file.Stmts {
				if statement.Cmd == declaration {
					isRoot = true
					break
				}
			}
			if !isRoot {
				safe = false
				return false
			}
		}
		if call, ok := node.(*syntax.CallExpr); ok && len(call.Args) > 0 {
			name := call.Args[0].Lit()
			if name == "eval" || name == "source" || name == "." || name == "alias" || name == "unalias" || name == "unset" {
				safe = false
				return false
			}
		}
		return true
	})
	if !safe {
		return nil, false
	}
	calls := make([]callFact, 0)
	functionIndex := uint32(0)
	for _, statement := range file.Stmts {
		declaration, ok := statement.Cmd.(*syntax.FuncDecl)
		if !ok {
			continue
		}
		sourceIndex := functionIndex
		functionIndex++
		syntax.Walk(declaration.Body, func(node syntax.Node) bool {
			if node == nil {
				return true
			}
			if _, nested := node.(*syntax.FuncDecl); nested {
				return false
			}
			switch node.(type) {
			case *syntax.CmdSubst, *syntax.ProcSubst:
				return false
			}
			call, ok := node.(*syntax.CallExpr)
			if !ok || len(call.Args) == 0 || len(call.Args[0].Parts) != 1 {
				return true
			}
			literal, ok := call.Args[0].Parts[0].(*syntax.Lit)
			if !ok {
				return true
			}
			start := literal.Pos().Offset()
			end := literal.End().Offset()
			if end < start || end > uint(len(source)) || !bytes.Equal(source[int(start):int(end)], []byte(literal.Value)) {
				return true
			}
			candidates := indexes[literal.Value]
			if len(candidates) != 1 {
				return true
			}
			calls = append(calls, callFact{
				SourceFunctionIndex: uint32(sourceIndex),
				TargetFunctionIndex: candidates[0],
				Name:                literal.Value,
				Start:               uint32(start),
				End:                 uint32(end),
				CandidateIndexes:    []uint32{candidates[0]},
				ParserProvenance:    "mvdan.cc/sh/v3@v3.13.1.CallExpr.literal-command",
			})
			return true
		})
	}
	return calls, true
}

func physicalLineCount(source []byte) int {
	if len(source) == 0 {
		return 0
	}
	count := bytes.Count(source, []byte{'\n'})
	if source[len(source)-1] != '\n' {
		count++
	}
	return count
}

func exceedsNestingLimit(file *syntax.File) bool {
	depth := 0
	exceeded := false
	stack := make([]bool, 0, 32)
	syntax.Walk(file, func(node syntax.Node) bool {
		if node == nil {
			counted := stack[len(stack)-1]
			stack = stack[:len(stack)-1]
			if counted {
				depth--
			}
			return true
		}
		if exceeded {
			return false
		}
		counted := isNestingNode(node)
		stack = append(stack, counted)
		if counted {
			depth++
			if depth > maxNesting {
				exceeded = true
				depth--
				stack = stack[:len(stack)-1]
				return false
			}
		}
		return true
	})
	return exceeded
}

func isNestingNode(node syntax.Node) bool {
	switch node.(type) {
	case *syntax.IfClause,
		*syntax.WhileClause,
		*syntax.ForClause,
		*syntax.CaseClause,
		*syntax.Subshell,
		*syntax.Block,
		*syntax.CmdSubst,
		*syntax.ProcSubst:
		return true
	default:
		return false
	}
}

func encodeResponse(code errorCode, functions []functionFact, calls []callFact) *byte {
	if functions == nil {
		functions = make([]functionFact, 0)
	}
	if calls == nil {
		calls = make([]callFact, 0)
	}
	encoded, err := json.Marshal(response{Code: code, Functions: functions, Calls: calls})
	if err != nil {
		encoded = []byte(`{"code":10,"functions":[],"calls":[]}`)
	}
	resultBuffer = encoded
	if len(resultBuffer) == 0 {
		return &zeroByte
	}
	return &resultBuffer[0]
}

func main() {}
