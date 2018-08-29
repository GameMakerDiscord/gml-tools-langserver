export interface ClientViewNode {
    /** This is the model name of the resource. */
    modelName: string;

    /** This is the human readable name of a resource, such as "objPlayer". */
    name: string;

    /** This is the UUID of the resource. */
    id: string;

    /** This is the absolute filepath to the .YY file which describes the Resource. */
    fpath: string;
}

export declare type ResourceNames =
    "objects"
    | "rooms" | "sprites" | "sounds" | "paths" | "views" | "scripts"
    | "fonts" | "timelines" | "tilesets" | "notes" | "extensions" | "shaders" | "datafiles_yy"
