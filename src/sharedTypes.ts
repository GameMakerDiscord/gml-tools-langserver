export interface ClientViewNode {
    /** This is the model name of the resource. */
    modelName: string;

    /** This is the human readable name of a resource, such as "objPlayer". */
    name: string;

    /** This is the UUID of the resource. */
    id: string;

    /** This is the absolute filepath to the .YY file which describes the Resource. */
    fpath: string;

    /** This is the fiterType.*/
    filterType: string;
}

export interface ResourcePackage {
    /** This is the name of the script to create. */
    resourceName: string;

    /** This is the UUID of the GMFolder to create the Script under. */
    viewUUID: string;
}
