import csharp from "@ast-grep/lang-csharp";
import dart from "@ast-grep/lang-dart";
import kotlin from "@ast-grep/lang-kotlin";
import ruby from "@ast-grep/lang-ruby";
import scala from "@ast-grep/lang-scala";
import swift from "@ast-grep/lang-swift";
import { parse, registerDynamicLanguage, type SgNode } from "@ast-grep/napi";

/**
 * ast-grep replaces, rather than merges, its dynamic-language registry.
 * Register every first-party grammar together so extractors remain composable.
 */
registerDynamicLanguage({ csharp, dart, kotlin, ruby, scala, swift });

export { parse, type SgNode };
