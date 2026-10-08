/** Include the bounded Cargo metadata reader in affected configuration identities. */
export function cargoManifestIdentitySource(contents: string): string {
  return /^[ \t]*[A-Za-z0-9_-]+[ \t]*=[ \t]*(?:"""|''')/mu.test(contents)
    ? `cargo-multiline-metadata-v1\0${contents}`
    : contents;
}
