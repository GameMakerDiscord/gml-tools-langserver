# README

## Basics of the Language Server ##
GML-Tools is a language server, compliant with Microsoft's Language Server Protocol. This language server **only works with GameMaker Studio 2 files explicitly**. In the interest of simplicity, we have chosen to not support GMS1.4 in any capacity. Using the server in a GMS1.4 project (or earlier) is not expected, and will likely fail.

## Current State of Development ##

**GML-Tools currently supports the following type features:**
* Real time diagnostics
* Hovers
* Goto definition (objects, variables, scripts, enums)
* Completion
* Signature help

**GML-Tools will support the following type features soon:**
* Find all references
* Document symbols
* Workspace symbol search
* Rename

**GML-Tools also has support for the following GML-specific commands, if the client integrates it:**
* Create Script
* Create Object
* Create Event
* Compile to the VM (Windows only for now) -- *Note: other compiles could be supported if there is sufficient interest.*

Currently, however, this Github repository, out of convenience for development, is showing the VSCode implementation of the 
Server. In the near future, this repository will be squashed, and changed to only host the server itself, and not the client implementations.

## Contributors ##
This language server has been made by Jonathan Spira, @sanboxstudios or @sanbox anywhere people @ each other. 

## Issue Reporting ##
If you are using the Language Server, you can report any issues by submitting an Issue, or DMing Sanbox on discord or twitter.
If the issue is a grammar issue, please flag such an issue with [GRAMMAR] at the front of it. If the issue is a documentation issue (an existing function showing up as non-existent, missing hover/signature support for functions, etc.) please flag the issue with [DOCS].

## How to Use/Install ##
Currently, the Language Server is in an alpha state, and is not suitable to be used in full sized projects. If, however, you would like to check in on it, do the following:

0. Install the latest versions of: Visual Studio Code, NodeJS, and Typescript. Back up your project you intend to use this on.
1. Download and open the project. Run: `npm install` to install the necessary dependencies.
2. Run the client by F5 or through the debugger. Do not run the "server" configuration unless you are debugging the server.
3. The *Extension Development Host Environment* will open. Navigate to your GMS2 project, and allow the indexing to complete. 
4. You're up and running!

When the LS enters Beta, implementations of the extension will be made available in the VSCode Extension Marketplace for a simple install.
