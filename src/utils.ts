import { Range, Position } from "vscode-languageserver/lib/main";
import { parse } from "url";
import { FileSystem } from "./fileSystem";

export function convertPositionToRange(lines: Array<string>, pos: number): Range {
    let counter = 0;
    for (let index = 0; index < lines.length; index++) {
        const element = lines[index];
        let oldcounter = counter;
        counter += element.length + 2;

        if (counter >= pos) {
            let startLine = index;
            let startChar = pos - oldcounter;

            let endline = index;
            let endChar = getWordAtIndex(element, startChar).length + startChar;
            return Range.create(startLine, startChar, endline, endChar);
        }
    }
    return Range.create(0, 0, 0, 0);
}
/**
 * This function will get a word (including _ and . words) at the 
 * specified index within a text document. The index must be 0-based.
 * @param str Full text document string
 * @param pos The 0-based index.
 */
export function getWordAtIndex(str: string, pos: number): string {
    // script from 'https://bit.ly/2KrOpWv', modified for TS slightly

    // Search for the word's beginning and end.
    const leftArray = str.slice(0, pos + 1).match(/\W*([A-Za-z0-9_.]+$)/);
    if (leftArray === null ) { return null }
    let leftNonWords = leftArray[0].length - leftArray[1].length;
    const left = leftArray.index + leftNonWords;

    let right = str.slice(pos).search(/[^A-Za-z0-9_]/);

    // The last word in the string is a special case.
    if (right < 0) {
        return str.slice(left);
    }
    // Return the word, using the located bounds to extract it from the string.
    return str.slice(left, right + pos);
}

export function formatError(message: string, err: any): string {
    if (err instanceof Error) {
        let error = <Error>err;
        return `${message}: ${error.message}\n${error.stack}`;
    } else if (typeof err === "string") {
        return `${message}: ${err}`;
    } else if (err) {
        return `${message}: ${err.toString()}`;
    }
    return message;
}

export function regexLastIndexOf(string: string, regex: RegExp, startpos: number) {
    regex = regex.global
        ? regex
        : new RegExp(
              regex.source,
              "g" + (regex.ignoreCase ? "i" : "") + (regex.multiline ? "m" : "")
          );
    if (typeof startpos == "undefined") {
        startpos = string.length;
    } else if (startpos < 0) {
        startpos = 0;
    }
    let stringToWorkWith = string.substring(0, startpos + 1);
    let lastIndexOf = -1;
    let nextStop = 0;
    let result;

    while ((result = regex.exec(stringToWorkWith)) != null) {
        lastIndexOf = result.index;
        regex.lastIndex = ++nextStop;
    }
    return lastIndexOf;
}

export function regexIndexOf (str: string,regex: RegExp, startpos: number): number {
    var indexOf = str.substring(startpos || 0).search(regex);
    return (indexOf >= 0) ? (indexOf + (startpos || 0)) : indexOf;
}

export function lastIndexOfArray(
    string: string,
    searchArray: Array<string>,
    startPosition?: number
) {
    let retIndex = -1;
    let thisLastIndex;
    searchArray.forEach(element => {
        thisLastIndex = string.lastIndexOf(element, startPosition);
        if (thisLastIndex > retIndex) {
            retIndex = thisLastIndex;
        }
    });
    return retIndex;
}

/**
 * This function normalizes all line terminator sequences
 * to be a standard "\n" sequence. This is done for the
 * purpose of character counting for the diagnostic, since
 * Clients will interpret \r\n and \n as one character, while
 * the parser will treat them as two.
 * @param text Full text document to be converted.
 * @returns Full text document converted to standard line endings.
 */
export function normalizeEoLSequences(text: string): string {
    // Replace all occurrences of \r\n with \n;
    if (text) {
        return text.replace(new RegExp(/(\r\n|\r)/,'g'),"\n");
    } else return "";
}

export function replaceAllRegex(str: string, find: RegExp, replace: string): string {
    return str.replace(new RegExp(find, 'g'), replace);
}


export class timeUtil {
    private fastTime: [number, number];

    constructor() {};

    public setTimeFast() {
        this.fastTime = process.hrtime();
    }

    public timeDifferenceNowNice() {
        let diff = process.hrtime(this.fastTime);
        this.fastTime = [0,0];
        return (diff[0].toString() + "s " + diff[1]/1000000 + "ms");
    }
}

export async function extractRestofLine(totalString: string, initPos: number) {
    let nextLineBreak = totalString.indexOf("\n", initPos);
    return totalString.substring(initPos, nextLineBreak);
}

/**
 * Converts a Position into a 0-offset index.
 * @param str The full text document, including all line breaks. This
 * works best after normalizing EoL sequences to \n.
 * @param index The absolute index (0 based) to find the Position at.
 */
export function getPositionFromIndex(str: string, index: number): Position {
    let lineNum = 0;
    let colNum = 0;
    let currIndex = 0;

    while (currIndex < index) {
        let c = str.charAt(currIndex++);
        if (c === "\n") {
            lineNum++;
            colNum = 0;
        } else if (c !== "\r") {
            colNum++;
        }
    }
    return {
        line: lineNum,
        character: colNum
    };
}

/**
 * Converts a 0-offset into a Position.
 * @param str FullTextDocument string. 
 * @param pos The index to be turned into a Position.
 */
export function getIndexFromPosition(str: string, pos: Position): number {
    let currLine = 0;
    let indexTally = 0;
    let workingString = str;

    while (pos.line > currLine) {
        let thisLineLength = workingString.indexOf("\n");
        indexTally += thisLineLength + 1;
        workingString = workingString.slice(thisLineLength + 1);
        currLine++;
    }

    indexTally += pos.character;

    return indexTally;
}


/**
 * Converts an abolute path to a file:// uri
 *
 * @param path an absolute path
 */
export function path2uri(path: string): string {
    // Require a leading slash, on windows prefixed with drive letter
    if (!/^(?:[a-z]:)?[\\\/]/i.test(path)) {
        throw new Error(`${path} is not an absolute path`)
    }

    const parts = path.split(/[\\\/]/)

    // If the first segment is a Windows drive letter, prefix with a slash and skip encoding
    let head = parts.shift()!
    if (head !== '') {
        head = '/' + head
    } else {
        head = encodeURIComponent(head)
    }

    return `file://${head}/${parts.map(encodeURIComponent).join('/')}`
}

/**
 * Converts a uri to an absolute path.
 * The OS style is determined by the URI. E.g. `file:///c:/foo` always results in `c:\foo`
 *
 * @param uri a file:// uri
 */
export function uri2path(uri: string): string {
    const parts = parse(uri)
    if (parts.protocol !== 'file:') {
        throw new Error('Cannot resolve non-file uri to path: ' + uri)
    }

    let filePath = parts.pathname || ''

    // If the path starts with a drive letter, return a Windows path
    if (/^\/[a-z]:\//i.test(filePath)) {
        filePath = filePath.substr(1).replace(/\//g, '\\')
    }

    return decodeURIComponent(filePath)
}

// /**
//  * Returns a word at a given postion.
//  * @param uri The uri of the document to find the word in.
//  * @param pos The Position of the word to find.
//  */
// export function getWordAtPosition(uri: string, pos: Position) {
//     const textDocument = normalizeEoLSequences(readFileSync(Uri.parse(uri).fsPath, "utf8"));
//     const offset = getIndexFromPosition(textDocument, pos);
//     return getWordAtIndex(textDocument, offset);
// }

/**
 * Identical to `getWordAtPosition` but finds the document in the FS.
 * @param uri The uri of the document to find the word in.
 * @param pos The Position of the word to find.
 * @param fs The FileSystem.
 */
export async function getWordAtPositionFS(uri: string, pos: Position, fs: FileSystem) {
    const textDocument = normalizeEoLSequences(await fs.getDocument(uri));
    const offset = getIndexFromPosition(textDocument, pos);
    return getWordAtIndex(textDocument, offset-1);
}


export async function getRangeAtPosition(uri: string, pos: Position, fs: FileSystem) {
    const textDocument = normalizeEoLSequences(await fs.getDocument(uri));
    const offset = getIndexFromPosition(textDocument, pos);
    const rangeOffsets = getRangeOffsetsAtPosition(textDocument, offset);
    return Range.create(
        getPositionFromIndex(textDocument, rangeOffsets[0]),
        getPositionFromIndex(textDocument, rangeOffsets[1])
    )
}

export function getRangeOffsetsAtPosition(textDocument: string, offset: number) {
    // Search for the word's beginning and end.
    const leftArray = textDocument.slice(0, offset + 1).match(/\W*([A-Za-z0-9_.]+$)/);
    if (leftArray === null ) { return null }

    let leftNonWords = leftArray[0].length - leftArray[1].length;
    const left = leftArray.index + leftNonWords;

    let right = textDocument.slice(offset).search(/[^A-Za-z0-9_]/) + offset;

    // Return the bounds of the word:
    return [left, right];
}
