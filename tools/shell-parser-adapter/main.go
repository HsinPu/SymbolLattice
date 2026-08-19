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
	abiVersionValue  = 1
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
}

type response struct {
	Code      errorCode      `json:"code"`
	Functions []functionFact `json:"functions"`
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
		return encodeResponse(codeInternal, nil)
	}
	source := inputBuffer[:int(size):int(size)]
	if dialect != 1 && dialect != 2 {
		return encodeResponse(codeInvalidDialect, nil)
	}
	if len(source) > maxSourceBytes {
		return encodeResponse(codeSourceLimit, nil)
	}
	if !utf8.Valid(source) {
		return encodeResponse(codeInvalidUTF8, nil)
	}
	if bytes.IndexByte(source, 0) >= 0 {
		return encodeResponse(codeNUL, nil)
	}
	if physicalLineCount(source) > maxPhysicalLines {
		return encodeResponse(codeLineLimit, nil)
	}

	variant := syntax.LangPOSIX
	if dialect == 2 {
		variant = syntax.LangBash
	}
	// Deliberately omit RecoverErrors and StopAt. Their zero values are part of
	// this ABI: one whole-file parse either succeeds or returns codeParseError.
	file, err := syntax.NewParser(syntax.Variant(variant)).Parse(bytes.NewReader(source), "")
	if err != nil {
		return encodeResponse(codeParseError, nil)
	}
	if exceedsNestingLimit(file) {
		return encodeResponse(codeNestingLimit, nil)
	}

	functions := make([]functionFact, 0)
	for _, stmt := range file.Stmts {
		decl, ok := stmt.Cmd.(*syntax.FuncDecl)
		if !ok {
			continue
		}
		if decl.Name == nil || len(decl.Names) != 0 || (!decl.RsrvWord && !decl.Parens) {
			return encodeResponse(codeUnexpectedAST, nil)
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
		})
		if len(functions) > maxRootFunctions {
			return encodeResponse(codeFunctionLimit, nil)
		}
	}
	return encodeResponse(codeOK, functions)
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

func encodeResponse(code errorCode, functions []functionFact) *byte {
	if functions == nil {
		functions = make([]functionFact, 0)
	}
	encoded, err := json.Marshal(response{Code: code, Functions: functions})
	if err != nil {
		encoded = []byte(`{"code":10,"functions":[]}`)
	}
	resultBuffer = encoded
	if len(resultBuffer) == 0 {
		return &zeroByte
	}
	return &resultBuffer[0]
}

func main() {}
