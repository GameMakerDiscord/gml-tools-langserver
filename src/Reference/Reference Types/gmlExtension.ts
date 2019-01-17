import { IExtension, JSDOC } from '../../declarations';
import { Callables } from '../callables';
import { Location, Range } from 'vscode-languageserver';
import { GMLVarParse } from '../../diagnostic';

export class GMLExtension implements IExtension {
    public JSDOC: JSDOC;
    public doNotAutoComplete: boolean;
    public originLocation: Location;
    public readonly callables: Callables;
    public readonly name: string;
    public callableType: 'extension' = 'extension';

    public members: { [variableName: string]: GMLVarParse } = {};
    public referenceLocations: Location[] = [];

    constructor(jsdoc: JSDOC, name: string, originLocation: Location, doNotComplete: boolean, callables: Callables) {
        this.JSDOC = jsdoc;
        this.name = name;
        this.doNotAutoComplete = doNotComplete;
        this.originLocation = originLocation;

        this.callables = callables;
    }

    public addReference(referenceURI: string, referenceRange: Range) {
        // Add to the script object
        const i = this.referenceLocations.push(Location.create(referenceURI, referenceRange)) - 1;

        this.callables.URIRecord[referenceURI].events.push({
            index: i,
            name: name
        });
    }
}
