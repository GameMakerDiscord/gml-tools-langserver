# README

## Basics of the Language Server ##
GML-Tools is a language server, compliant with Microsoft's Language Server Protocol. This language server **only works with GameMaker Studio 2 files explicitly**. In the interest of simplicity, we have chosen to not support GMS1.4 in any capacity. Using the server in a GMS1.4 project (or earlier) is not expected, and will likely fail.

## Current State of Development ##

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


## Contributors ##
This language server has been made by Jonathan Spira, @sanboxstudios or @sanbox anywhere people @ each other. 

## Issue Reporting ##
If you are using the Language Server, you can report any issues by submitting an Issue, or DMing Sanbox on discord or twitter.
If the issue is a grammar issue, please flag such an issue with [GRAMMAR] at the front of it. If the issue is a documentation issue (an existing function showing up as non-existent, missing hover/signature support for functions, etc.) please flag the issue with [DOCS].

