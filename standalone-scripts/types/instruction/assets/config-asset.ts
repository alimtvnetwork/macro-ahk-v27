/**
 * A static JSON config file shipped with the script. The runtime
 * exposes the parsed object on the project namespace under `Key`
 * (or `InjectAs` if provided).
 *
 * All keys PascalCase per `mem://standards/pascalcase-json-keys`.
 */
export type ConfigAsset = {
    readonly File: string;
    readonly Key: string;
    readonly InjectAs?: string;
};
