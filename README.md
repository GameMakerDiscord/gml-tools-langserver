# README

## Basics of the Language Server

GML-Tools is a language server, compliant with Microsoft's Language Server Protocol. This language server **only works with GameMaker Studio 2 files explicitly**. In the interest of simplicity, we have chosen to not support GMS1.4 in any capacity. Using the server in a GMS1.4 project (or earlier) is not expected, and will likely fail.

## Current State of Development

**GML-Tools currently supports the following type features:**

* Real time diagnostics
* Hovers
* Goto definition (variables, scripts, enums, macros)
* Auto-complete
* Signature Support

**GML-Tools will support the following type features soon:**

* Find all references
* Document symbols
* Workspace symbol search
* Rename

**GML-Tools also has support for the following GML-specific commands, if the client integrates it:**

* Create Script
* Create Object
* Create Event
* Compile and test project. (Windows Only) -- *Note: other platforms could be supported if there is sufficient interest.*

**GML-Tools will support the following GML-specific commands, if the client integrates them:**

* Better documentation support
* Delete Resource
* Delete Event
* Create Sprite

## Contributors

This language server has been made by Jonathan Spira, @sanboxstudios or @sanbox anywhere people @ each other.

## Issue Reporting

If you are using the Language Server, you can report any issues by submitting an Issue, or DMing Sanbox on discord or twitter.
If the issue is a grammar issue, please flag such an issue with [GRAMMAR] at the front of it. If the issue is a documentation issue (an existing function showing up as non-existent, missing hover/signature support for functions, etc.) please flag the issue with [DOCS].

## How to Debug the Language Server

1. Create a folder where you would like to store the GML-Tools Language Server and the GML-Tools VSCode Client Implementation.

2. Open a terminal in that folder and clone this repository with:

    ```git
    git clone https://github.com/GameMakerDiscord/gml-tools-langserver.git
    ```

3. Clone [the Visual Studio Code client found here](https://github.com/user/repo/blob/branch/other_file.md) as well to the same folder:
    ```git
    git clone
    https://github.com/sanboxrunner/gml-tools-vsc-client
    ```
4. Install dependencies for each folder (you will need to move your terminal into each folder for this):

    ```npm
    npm install
    ```

5. Compile the Language Server with the Task: `"Language Server -- Build"`:

    *Tip: Use `"Language Server -- Watch"` to write Typescript and have it transpiled in realtime for you.*

    You may run into an error here in the Ohm-JS library regarding the "Node-List" typing. You can safely comment that out in the Ohm-JS typings until they have resolved the error -- we do not use that typing.

6. Compile the Client with the Task: `"Client -- Watch"`:

    *Tip: We compile it in Watch here because we will be doing some initial set up in the Client*

7. Edit the Client `launch.json` and `extension.ts` files:

    1. Find the absolute path to the Language Server's root folder. Examples of such a path are: `C:\myProjects\gml-tools-langserver` or `/Users/Mario/gml-tools-langserver`.

        Change the Configuration `Attach To Server` to this:
        ```json
        {
            "type": "node",
            "request": "attach",
            "name": "Attach to Server",
            "address": "localhost",
            "protocol": "inspector",
            "port": 6009,
            "sourceMaps": true,
            "outFiles": ["ABSOLUTE_FILEPATH_TO_LANGUAGE_SERVER/out/**/*.js"]
        }
        ```
        where "ABSOLUTE_FILEPATH_TO_LANGUAGE_SERVER" has been replaced with the absolute filepath to the language server retrieved previously.

    2. In your client folder, open `/src/extension.ts`. Comment out this line:
        ```ts
        let serverModule = context.asAbsolutePath(path.join("node_modules", "gml-tools-langserver", 'out', "server.js" ));
        ```
        and instead add in this line:
        ```ts
        let serverModule = "ABSOLUTE_FILEPATH_TO_LANGUAGE_SERVER/out/server.js";
        ```
        where "ABSOLUTE_FILEPATH_TO_LANGUAGE_SERVER" has been replaced with the absolute filepath to the language server retrieved previously.

8. Begin the Extension by pressing `F5`. To place breakpoints in the Typescript of the language server, once the client is running, launch the "Attach to Server" process from the debug menu, or use the Client/Server option to launch both at once.

9. Happy coding! If any problems occur, please add an issue.