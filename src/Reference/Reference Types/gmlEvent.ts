import { IObject, IVars } from '../../declarations';
import { Location, Range } from 'vscode-languageserver';
import { Callables } from '../callables';
import { GMLVarParse } from '../../diagnostic';

export class GMLEvent {
    public uri: string;
    public object: IObject;
    public members: { [variableName: string]: GMLVarParse };
    public referenceLocations: Location[];

    callables: Callables;

    constructor(uri: string, object: IObject, callables: Callables) {
        this.uri = uri;
        this.object = object;
        this.referenceLocations = [];
        this.members = {};

        this.callables = callables;
    }

    public addReference(referenceURI: string, referenceRange: Range) {
        // Add to the script object
        const i = this.referenceLocations.push(Location.create(referenceURI, referenceRange)) - 1;

        // Create the Record Object if it doesn't exist
        if (!this.callables.URIRecord[referenceURI]) this.callables.reference.URIcreateURIDictEntry(referenceURI);

        this.callables.URIRecord[referenceURI].events.push({
            index: i,
            name: this.uri
        });
    }
}
