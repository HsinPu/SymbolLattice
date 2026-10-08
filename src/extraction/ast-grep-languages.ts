import csharp from "@ast-grep/lang-csharp";
import dart from "@ast-grep/lang-dart";
import java from "@ast-grep/lang-java";
import kotlin from "@ast-grep/lang-kotlin";
import ruby from "@ast-grep/lang-ruby";
import scala from "@ast-grep/lang-scala";
import swift from "@ast-grep/lang-swift";
import { parse, registerDynamicLanguage, type SgNode } from "@ast-grep/napi";

/**
 * ast-grep replaces, rather than merges, its dynamic-language registry.
 * Register every first-party grammar together so extractors remain composable.
 */
registerDynamicLanguage({ csharp, dart, java, kotlin, ruby, scala, swift });

const childrenCache = new WeakMap<SgNode, readonly SgNode[]>();

/** Parsed native trees are immutable; share child wrappers within one tree. */
export function cachedChildren(node: SgNode): readonly SgNode[] {
  let children = childrenCache.get(node);
  if (children === undefined) {
    children = node.children();
    childrenCache.set(node, children);
  }
  return children;
}

export { parse, type SgNode };
