# README

## Basics of the Language Server

GML-Tools is a language server, compliant with Microsoft's Language Server Protocol. This language server **only works with GameMaker Studio 2 files explicitly**. In the interest of simplicity, we have chosen to not support GMS1.4 in any capacity. Using the server in a GMS1.4 project (or earlier) is not expected, and will likely fail.

## Current State of Development

**GML-Tools currently supports the following type features:**

-   Real time diagnostics
-   Hovers
-   Goto definition (variables, scripts, enums, macros)
-   Auto-complete
-   Signature Support

**GML-Tools will support the following type features soon:**

-   Find all references
-   Document symbols
-   Workspace symbol search
-   Rename

**GML-Tools also has support for the following GML-specific commands, if the client integrates it:**

-   Create Script
-   Create Object
-   Create Event
-   Compile and test project. (Windows Only) -- _Note: other platforms could be supported if there is sufficient interest._

**GML-Tools will support the following GML-specific commands, if the client integrates them:**

-   Better documentation support
-   Delete Resource
-   Delete Event
-   Create Sprite

## Contributors

Initial work on the Language Server was done by Jonathan Spira, @sanbox.
Additional work creating and integrating GameMaker Rubber was done by @ImDaveead.

## Issue Reporting

If you are using the Language Server, you can report any issues by submitting an Issue, or DMing Sanbox on discord or twitter.
If the issue is a grammar issue, please flag such an issue with [GRAMMAR] at the front of it. If the issue is a documentation issue (an existing function showing up as non-existent, missing hover/signature support for functions, etc.) please flag the issue with [DOCS].

## How to Debug the Language Server

0. Install Visual Studio Code (which is our first class client/test bed), Nodejs, and Yarn.

1. Create a folder where you would like to store the GML-Tools Language Server and the GML-Tools VSCode Client Implementation.

1. Open a terminal in that folder and clone this repository with:

    ```git
    git clone https://github.com/GameMakerDiscord/gml-tools-langserver.git
    ```

1. Clone [the Visual Studio Code client found here](https://github.com/sanboxrunner/gml-tools-vsc-client) as well to the same folder:
    ```git
    git clone
    https://github.com/sanboxrunner/gml-tools-vsc-client
    ```
1. Install dependencies for each folder (you will need to move your terminal into each folder for this):

    ```npm
    yarn
    ```

1. Compile the Language Server and the Client with the Tasks "Build" or "Watch". Do not compile by command line, as the Language Server and Client connect over a local interchange created in those "Build" and "Watch" commands.

1. Due to a bug in the `tsconfig.json` (see [this issue](https://github.com/Microsoft/TypeScript/issues/26531)), the absolute path of the sourceRoot in the Language Server `tsconfig.json` file will need to be added. Navigate to `"./gml-tools-ls/tsconfig.json"` and edit "sourceRoot" to be the following:

    ```json
    ...
    "sourceRoot": "ABSOLUTEPATH/gml-tools-ls/src",
    ...
    ```

    where "ABSOLUTEPATH" is the absolute path to `gml-tools-ls`.

1. Begin the Extension by pressing `F5`. To place breakpoints in the Typescript of the language server, once the client is running, launch the "Attach to Server" process from the debug menu, or use the Client/Server option to launch both at once.

1. Happy coding! If any problems occur, please add an issue. If you have any suggestions for simplifying this process while keeping the language server and the separate, please submit an issue. Thank you!

## Publishing an Update to the Language Server

0. Sanbox maintains the Language Server, and no one else should have or need to publish it. In the event, however, that someone else does need to publish an update, here are the necessary steps.

1. Remove the `"sourceRoot"` and `"sourceMap"` sections from the `tsconfig.json` entirely. Once Typescript can allow for relative sourceRoots, we can publish the sourcemaps along with the source.

1. Delete the `out` directory from your filesystem and confirm that `package.json` contains the following:

    ```json
    "files": [
    	"/out",
    	"/lib",
    	"License.txt",
    	"README.md",
    	"CODE_OF_CONDUCT.md"
    ],
    ```

    Then, compile with `build`.
    _Note: do **not** use `testBuild`._


1. Publish by running `yarn publish` and specifying a new version.

4. Update various clients to the new version.
