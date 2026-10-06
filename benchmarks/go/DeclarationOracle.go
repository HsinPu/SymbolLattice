// Independent declaration oracle: standard-library parsing only, no project execution.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"unicode/utf16"
)

type Request struct {
	Project string   `json:"project"`
	Files   []string `json:"files"`
}
type Position struct {
	Line   int `json:"line"`
	Column int `json:"column"`
}
type Range struct {
	Start Position `json:"start"`
	End   Position `json:"end"`
}
type Declaration struct {
	Name          string `json:"name"`
	Kind          string `json:"kind"`
	Receiver      string `json:"receiver"`
	ReceiverKnown bool   `json:"receiverKnown"`
	Range         Range  `json:"range"`
}
type FileResult struct {
	File         string        `json:"file"`
	Error        string        `json:"error,omitempty"`
	Declarations []Declaration `json:"declarations"`
}

func position(source []byte, offset int) Position {
	prefix := source[:offset]
	start := bytes.LastIndexByte(prefix, '\n') + 1
	return Position{bytes.Count(prefix, []byte{'\n'}) + 1,
		len(utf16.Encode([]rune(string(prefix[start:])))) + 1}
}

func main() {
	var request Request
	if err := json.NewDecoder(os.Stdin).Decode(&request); err != nil {
		panic(err)
	}
	results := make([]FileResult, 0, len(request.Files))
	for _, file := range request.Files {
		result := FileResult{File: file, Declarations: []Declaration{}}
		source, err := os.ReadFile(filepath.Join(request.Project, filepath.FromSlash(file)))
		if err != nil {
			panic(err)
		}
		set := token.NewFileSet()
		tree, err := parser.ParseFile(set, file, source, parser.AllErrors|parser.SkipObjectResolution)
		if err != nil {
			result.Error = err.Error()
			results = append(results, result)
			continue
		}
		for _, item := range tree.Decls {
			decl, ok := item.(*ast.FuncDecl)
			if !ok {
				continue
			}
			entry := Declaration{Name: decl.Name.Name, Kind: "function", ReceiverKnown: true,
				Range: Range{position(source, set.Position(decl.Pos()).Offset),
					position(source, set.Position(decl.End()).Offset)}}
			if decl.Recv != nil {
				entry.Kind, entry.ReceiverKnown = "method", false
				if len(decl.Recv.List) == 1 {
					receiver := decl.Recv.List[0].Type
					if pointer, ok := receiver.(*ast.StarExpr); ok {
						receiver = pointer.X
					}
					if name, ok := receiver.(*ast.Ident); ok {
						entry.Receiver, entry.ReceiverKnown = name.Name, true
					}
				}
			}
			result.Declarations = append(result.Declarations, entry)
		}
		results = append(results, result)
	}
	if err := json.NewEncoder(os.Stdout).Encode(results); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
