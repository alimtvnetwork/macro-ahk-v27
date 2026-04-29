/**
 * An HTML or text template shipped with the script. The runtime
 * registers the parsed template on the project namespace under
 * `InjectAs` (or the file's basename if omitted).
 *
 * All keys PascalCase per `mem://standards/pascalcase-json-keys`.
 */
export type TemplateAsset = {
    readonly File: string;
    readonly InjectAs?: string;
};
