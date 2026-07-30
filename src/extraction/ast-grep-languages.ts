import csharp from "@ast-grep/lang-csharp";
import kotlin from "@ast-grep/lang-kotlin";
import ruby from "@ast-grep/lang-ruby";
import { parse, registerDynamicLanguage, type SgNode } from "@ast-grep/napi";

/**
 * ast-grep replaces, rather than merges, its dynamic-language registry.
 * Register every first-party grammar together so extractors remain composable.
 */
registerDynamicLanguage({ csharp, kotlin, ruby });

export { parse, type SgNode };
