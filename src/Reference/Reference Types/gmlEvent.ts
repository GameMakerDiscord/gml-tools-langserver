import { IObject, IEvent } from '../../declarations';
import { Location, Range } from 'vscode-languageserver';
import { Callables } from '../callables';
import { GMLVarParse } from '../../diagnostic';

export class GMLEvent implements IEvent {
    public uri: string;
    public object: IObject;
    public members: { [variableName: string]: GMLVarParse };
    public referenceLocations: Location[];
    public name: string;
    public readonly callableType: 'event' = 'event';

    callables: Callables;

    constructor(uri: string, object: IObject, name: string, callables: Callables) {
        this.uri = uri;
        this.object = object;
        this.name = name;

        this.callables = callables;
        this.referenceLocations = [];
        this.members = {};
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
