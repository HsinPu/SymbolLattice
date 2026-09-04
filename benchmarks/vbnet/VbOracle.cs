using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.VisualBasic;
using Microsoft.CodeAnalysis.VisualBasic.Syntax;
using Microsoft.CodeAnalysis.Text;

internal static class VbOracle
{
    private sealed class Container
    {
        internal readonly SyntaxNode Node;
        internal readonly SyntaxList<StatementSyntax> Members;
        internal readonly SyntaxToken Identifier;
        internal readonly SyntaxTokenList Modifiers;
        internal readonly bool IsModule;

        internal Container(ModuleBlockSyntax value)
        {
            Node = value;
            Members = value.Members;
            Identifier = value.ModuleStatement.Identifier;
            Modifiers = value.ModuleStatement.Modifiers;
            IsModule = true;
        }

        internal Container(ClassBlockSyntax value)
        {
            Node = value;
            Members = value.Members;
            Identifier = value.ClassStatement.Identifier;
            Modifiers = value.ClassStatement.Modifiers;
            IsModule = false;
        }
    }

    private static readonly HashSet<string> Ignored = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        ".git", ".SymbolLattice", "bin", "obj", "node_modules", "artifacts", "packages"
    };

    private static bool HasModifier(SyntaxTokenList modifiers, SyntaxKind kind)
    {
        return modifiers.Any(token => token.IsKind(kind));
    }

    private static IEnumerable<string> Files(string root)
    {
        var pending = new Stack<string>();
        pending.Push(root);
        while (pending.Count > 0)
        {
            var directory = pending.Pop();
            foreach (var child in Directory.EnumerateDirectories(directory))
            {
                if (!Ignored.Contains(Path.GetFileName(child))) pending.Push(child);
            }
            foreach (var file in Directory.EnumerateFiles(directory, "*.vb")) yield return file;
        }
    }

    private static string Relative(string root, string path)
    {
        var rootUri = new Uri(root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar);
        return Uri.UnescapeDataString(rootUri.MakeRelativeUri(new Uri(path)).ToString()).Replace('\\', '/');
    }

    private static string Position(SyntaxTree tree, TextSpan span)
    {
        var position = tree.GetLineSpan(span).StartLinePosition;
        return (position.Line + 1) + "\t" + position.Character;
    }

    private static bool HazardousTarget(MethodBlockSyntax target)
    {
        var statement = target.SubOrFunctionStatement;
        if (!HasModifier(statement.Modifiers, SyntaxKind.PrivateKeyword)) return true;
        return statement.ParameterList.Parameters.Any(parameter =>
            HasModifier(parameter.Modifiers, SyntaxKind.OptionalKeyword) ||
            HasModifier(parameter.Modifiers, SyntaxKind.ParamArrayKeyword));
    }

    private static bool HasSingleLineStatement(SyntaxTree tree, MethodBlockSyntax method)
    {
        var span = tree.GetLineSpan(method.SubOrFunctionStatement.Span);
        return span.StartLinePosition.Line == span.EndLinePosition.Line;
    }

    private static bool HazardousCaller(MethodBlockSyntax caller)
    {
        return Regex.IsMatch(caller.ToFullString(), @"\b(?:Function|Sub)\s*\(", RegexOptions.IgnoreCase) ||
            caller.DescendantNodes().Any(node =>
            node.Kind().ToString().IndexOf("Lambda", StringComparison.Ordinal) >= 0 ||
            node.GetType().Name.StartsWith("Xml", StringComparison.Ordinal));
    }

    private static HashSet<string> CallerBindings(MethodBlockSyntax caller)
    {
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var parameter in caller.SubOrFunctionStatement.ParameterList.Parameters)
        {
            names.Add(parameter.Identifier.Identifier.ValueText);
        }
        foreach (var declaration in caller.DescendantNodes().OfType<LocalDeclarationStatementSyntax>())
        {
            foreach (var declarator in declaration.Declarators)
            {
                foreach (var name in declarator.Names) names.Add(name.Identifier.ValueText);
            }
        }
        return names;
    }

    private static bool InsideNestedCallable(InvocationExpressionSyntax invocation, MethodBlockSyntax caller)
    {
        return invocation.Ancestors().TakeWhile(node => node != caller).Any(node =>
            node is LambdaExpressionSyntax || node is MethodBlockSyntax);
    }

    private static IEnumerable<Container> Containers(SyntaxNode root)
    {
        foreach (var node in root.DescendantNodes())
        {
            if (node.Ancestors().Any(parent => parent is ModuleBlockSyntax || parent is ClassBlockSyntax)) continue;
            var module = node as ModuleBlockSyntax;
            if (module != null) yield return new Container(module);
            var type = node as ClassBlockSyntax;
            if (type != null) yield return new Container(type);
        }
    }

    public static int Main(string[] args)
    {
        if (args.Length != 1 || !Directory.Exists(args[0]))
        {
            Console.Error.WriteLine("Usage: VbOracle <source-root>");
            return 2;
        }
        var root = Path.GetFullPath(args[0]);
        var files = 0;
        var rejected = 0;
        var candidates = 0;
        foreach (var path in Files(root).OrderBy(value => value, StringComparer.OrdinalIgnoreCase))
        {
            files++;
            var source = File.ReadAllText(path);
            var tree = VisualBasicSyntaxTree.ParseText(source, VisualBasicParseOptions.Default, path);
            if (tree.GetDiagnostics().Any(diagnostic => diagnostic.Severity == DiagnosticSeverity.Error))
            {
                rejected++;
                continue;
            }
            var syntaxRoot = tree.GetRoot();
            foreach (var container in Containers(syntaxRoot))
            {
                if (HasModifier(container.Modifiers, SyntaxKind.PartialKeyword)) continue;
                var methods = container.Members.OfType<MethodBlockSyntax>().ToArray();
                var unique = methods
                    .GroupBy(method => method.SubOrFunctionStatement.Identifier.ValueText, StringComparer.OrdinalIgnoreCase)
                    .Where(group => group.Count() == 1)
                    .ToDictionary(group => group.Key, group => group.Single(), StringComparer.OrdinalIgnoreCase);
                foreach (var caller in methods)
                {
                    if (!HasSingleLineStatement(tree, caller) || HazardousCaller(caller)) continue;
                    var bindings = CallerBindings(caller);
                    foreach (var invocation in caller.DescendantNodes().OfType<InvocationExpressionSyntax>())
                    {
                        if (InsideNestedCallable(invocation, caller)) continue;
                        var identifier = invocation.Expression as IdentifierNameSyntax;
                        if (identifier == null) continue;
                        MethodBlockSyntax target;
                        if (!unique.TryGetValue(identifier.Identifier.ValueText, out target)) continue;
                        if (!HasSingleLineStatement(tree, target) || HazardousTarget(target) || bindings.Contains(identifier.Identifier.ValueText)) continue;
                        if (!container.IsModule &&
                            HasModifier(caller.SubOrFunctionStatement.Modifiers, SyntaxKind.SharedKeyword) &&
                            !HasModifier(target.SubOrFunctionStatement.Modifiers, SyntaxKind.SharedKeyword)) continue;
                        var targetArity = target.SubOrFunctionStatement.ParameterList.Parameters.Count;
                        if (invocation.ArgumentList.Arguments.Count != targetArity) continue;
                        Console.WriteLine(string.Join("\t", new[] {
                            "CANDIDATE",
                            Relative(root, path),
                            container.Identifier.ValueText,
                            container.IsModule ? "module" : "class",
                            caller.SubOrFunctionStatement.Identifier.ValueText,
                            target.SubOrFunctionStatement.Identifier.ValueText,
                            targetArity.ToString(),
                            Position(tree, caller.SubOrFunctionStatement.Identifier.Span),
                            Position(tree, target.SubOrFunctionStatement.Identifier.Span),
                            Position(tree, identifier.Identifier.Span)
                        }));
                        candidates++;
                    }
                }
            }
        }
        Console.Error.WriteLine("SUMMARY\t" + files + "\t" + rejected + "\t" + candidates);
        return 0;
    }
}

