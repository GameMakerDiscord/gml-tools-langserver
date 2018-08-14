/** Namespace describing each ShaderLanguage type option in a ShaderYY file */
export namespace ShaderLanguageType {
    export const GLSLES: 0 = 0;
    export const GLSL: 2 = 2;
    export const HLSL: 4 = 4;
}
export type ShaderLanguageType = 0 | 2 | 4;

/** Unknown purpose, as opposed to true boolean. Used in Rooms */
export namespace PseudoBoolean {
    export const False: 0 = 0;
    export const True: 1 = 1;
}
export type PseudoBoolean = 0 | 1;

/** Sound 'kind' used in a SoundYY file */
export namespace SoundKind {
    export const UncompressedNotStreamed: 0 = 0;
    export const CompressedNotStreamed: 1 = 1;
    export const UncompressOnLoad: 2 = 2;
    export const CompressedStreamed: 3 = 3;
}
export type SoundKind = 0 | 1 | 2 | 3;

/** Sound 'type' used in a SoundYY file */
export namespace SoundType {
    export const Mono: 0 = 0;
    export const Stereo: 1 = 1;
    export const ThreeDee: 2 = 2;
}
export type SoundType = 0 | 1 | 2;

/** Path 'kind' used in a PathYY file */
export namespace PathKind {
    export const Straight: 0 = 0;
    export const Smooth: 1 = 1;
}
export type PathKind = 0 | 1;

/** Event 'type' used in  Events inside ObjectYY files. Within each 'type'
 *  there is also a `number` which describes a "sub-type" of the event.
 *  Use `EventNumber` for that subtype.
 */
export namespace EventType {
    export const Create: 0 = 0;
    export const Alarm: 1 = 1;
    export const Destroy: 2 = 2;
    export const Step: 3 = 3;
    export const Collision: 4 = 4;
    export const Keyboard: 5 = 5;
    export const Mouse: 6 = 6;
    export const Other: 7 = 7;
    export const Draw: 8 = 8;
    export const KeyPress: 9 = 9;
    export const KeyRelease: 10 = 10;
    export const Trigger: 11 = 11;
    export const CleanUp: 12 = 12;
    export const Gesture: 13 = 13;
}
export type EventType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

/**
 * Event `number` used in Events in ObjectYY files. Each
 * `EventType` only has some of these members.
 */
export namespace EventNumber {
    export const Create: 0 = 0;
    export const DrawNormal: 0 = 0;
    export const DrawBegin: 72 = 72;
    export const DrawEnd: 73 = 73;
    export const DrawPre: 76 = 76;
    export const DrawPost: 77 = 77;
    export const LeftButton: 0 = 0;
    export const RightButton: 1 = 1;
    export const MiddleButton: 2 = 2;
    export const NoButton: 3 = 3;
    export const LeftPress: 4 = 4;
    export const RightPress: 5 = 5;
    export const MiddlePress: 6 = 6;
    export const LeftRelease: 7 = 7;
    export const RightRelease: 8 = 8;
    export const MiddleRelease: 9 = 9;
    export const MouseEnter: 10 = 10;
    export const MouseLeave: 11 = 11;
    export const MouseWheelUp: 60 = 60;
    export const MouseWheelDown: 61 = 61;
    export const GlobalLeftButton: 50 = 50;
    export const GlobalRightButton: 51 = 51;
    export const GlobalMiddleButton: 52 = 52;
    export const GlobalLeftPress: 53 = 53;
    export const GlobalRightPress: 54 = 54;
    export const GlobalMiddlePress: 55 = 55;
    export const GlobalLeftRelease: 56 = 56;
    export const GlobalRightRelease: 57 = 57;
    export const GlobalMiddleRelease: 58 = 58;
    export const Joystick1Left: 16 = 16;
    export const Joystick1Right: 17 = 17;
    export const Joystick1Up: 18 = 18;
    export const Joystick1Down: 19 = 19;
    export const Joystick1Button1: 21 = 21;
    export const Joystick1Button2: 22 = 22;
    export const Joystick1Button3: 23 = 23;
    export const Joystick1Button4: 24 = 24;
    export const Joystick1Button5: 25 = 25;
    export const Joystick1Button6: 26 = 26;
    export const Joystick1Button7: 27 = 27;
    export const Joystick1Button8: 28 = 28;
    export const Joystick2Left: 31 = 31;
    export const Joystick2Right: 32 = 32;
    export const Joystick2Up: 33 = 33;
    export const Joystick2Down: 34 = 34;
    export const Joystick2Button1: 36 = 36;
    export const Joystick2Button2: 37 = 37;
    export const Joystick2Button3: 38 = 38;
    export const Joystick2Button4: 39 = 39;
    export const Joystick2Button5: 40 = 40;
    export const Joystick2Button6: 41 = 41;
    export const Joystick2Button7: 42 = 42;
    export const Joystick2Button8: 43 = 43;
    export const Outside: 0 = 0;
    export const Boundary: 1 = 1;
    export const GameStart: 2 = 2;
    export const GameEnd: 3 = 3;
    export const RoomStart: 4 = 4;
    export const RoomEnd: 5 = 5;
    export const NoMoreLives: 6 = 6;
    export const AnimationEnd: 7 = 7;
    export const EndOfPath: 8 = 8;
    export const NoMoreHealth: 9 = 9;
    export const CloseButton: 30 = 30;
    export const User0: 10 = 10;
    export const User1: 11 = 11;
    export const User2: 12 = 12;
    export const User3: 13 = 13;
    export const User4: 14 = 14;
    export const User5: 15 = 15;
    export const User6: 16 = 16;
    export const User7: 17 = 17;
    export const User8: 18 = 18;
    export const User9: 19 = 19;
    export const User10: 20 = 20;
    export const User11: 21 = 21;
    export const User12: 22 = 22;
    export const User13: 23 = 23;
    export const User14: 24 = 24;
    export const User15: 25 = 25;
    export const StepNormal: 0 = 0;
    export const StepBegin: 1 = 1;
    export const StepEnd: 2 = 2;
    export const Gui: 64 = 64;
    export const GuiBegin: 74 = 74;
    export const GuiEnd: 7 = 7;
}
export type EventNumber = 72 | 73 | 76 | 77 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 60 | 61 | 50 | 51 | 52 | 53 | 54 | 55 | 56 | 57 | 58 | 16 | 17 | 18 | 19 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 31 | 32 | 33 | 34 | 36 | 37 | 38 | 39 | 40 | 41 | 42 | 43 | 64 | 74 | 7; 

/** Resource file namespace */
export namespace Resource {
    export interface ObjectEvent {
        /** Event GUID */
        id: string;

        /** Internal resource type descriptor (GMEvent) */
        modelName: string;

        /** Version string, unknown use */
        mvc: string;

        /** Indicates if this event is drag and drop */
        IsDnD: boolean;

        /** Presumably, this holds the GUID of the other object if this were a collision event */
        collisionObjectId: string;

        /** Internal sub-event number */
        enumb: EventNumber;

        /** Internal Event number */
        eventtype: EventType;

        /** GUID of the object that owns this event (Can belong to parent object) */
        m_owner: string;
    }

    export interface Object {
        /** Resource GUID */
        id: string;

        /** Internal resource type descriptor (GMObject) */
        modelName: string;

        /** Version string, unknown use */
        mvc: string;

        /** Resource name */
        name: string;

        /** List of object events */
        eventList: Array<ObjectEvent>;

        /** GUID of sprite mask */
        maskSpriteId: string;

        /** Properties overriden. */
        overriddenProperties: Array<object>;

        /** Properties are variables set using the "variables" box in the IDE. */
        properties: Array<object>;

        /** GUID of parent object */
        parentObjectId: string;

        /** Indicates if this object is persistent */
        persistent: boolean;

        /** Indicates if this object uses physics */
        physicsObject: boolean;

        physicsAngularDamping: number;
        physicsDensity: number;
        physicsFriction: number;
        physicsGroup: number;
        physicsKinematic: boolean;
        physicsLinearDamping: number;
        physicsRestitution: number;
        physicsSensor: boolean;
        physicsShape: number;
        physicsShapePoints: Array<any> | null;
        physicsStartAwake: boolean;

        /** Indicates if this object is solid */
        solid: boolean;

        /** GUID of this object's sprite */
        spriteId: string;

        /** Indicates if this object is visible */
        visible: boolean;
    }

    export interface Options {
        /** Resource GUID */
        id: string;

        /** Internal resource type descriptor */
        modelName: string;

        /** Version string, unknown use */
        mvc: string;

        /** Resource name */
        name: string;
    }

    export interface Room {
        /** Resource name */
        name: string;

        /** Resource GUID */
        id: string;

        /** The name of the Room Creation code FP, relative to the Room folder itself. */
        creationCodeFile: string;

        /** Inherit Code from a Parent Room */
        inheritCode: boolean;

        /** Inherit Creation Order from a Parent Room */
        inheritCreationOrder: boolean;

        /** Inherit Layers from a Parent Room */
        inheritLayers: boolean;

        /** instanceCreationOrderIDs */
        instanceCreationOrderIDs: Array<string>;
        isDnD: boolean;

        /** All your layers are placed here. */
        layers: Array<Layer>;

        /** Internal resource type descriptor */
        modelName: string;

        /** Parent Room ID */
        parentID: string;

        /** Physics setting of the room. */
        physicsSettings: PhysicsSettings;

        /** Version string, unknown use */
        mvc: string;
    }

    export interface Layer {
        __type: string;
        name: string;
        id: string;
        depth: number;
        grid_x: number;
        grid_y: number;
        hierarchyFrozen: boolean;
        hierarchyVisible: boolean;
        inheritLayerDepth: boolean;
        inheritLayerSettings: boolean;
        inheritSubLayers: boolean;
        inheritVisibility: boolean;
        instances: Array<Instance>;
        layers: Array<Layer>;
        m_parentID: string;
        m_serialiseFrozen: boolean;
        modelName: string;
        mvc: string;
        userdefined_depth: boolean;
        visible: boolean;
    }

    export interface Instance {
        name: string;
        id: string;
        colour: Colour;
        creationCodeFile: string;
        creationCodeType: string;
        ignore: boolean;
        inheritCode: boolean;
        inheritItemSettings: boolean;
        IsDnD: boolean;
        m_originalParentID: string;
        m_serialiseFrozen: boolean;
        modelName: string;
        name_with_no_file_rename: string;
        objId: string;
        properties: null;
        rotation: number;
        scaleX: number;
        scaleY: number;
        mvc: string;
        x: number;
        y: number;
    }

    export interface Colour {
        Value: number;
    }

    export interface PhysicsSettings {
        id: string;
        inheritPhysicsSettings: boolean;
        modelName: string;
        PhysicsWorld: boolean;
        PhysicsWorldGravityX: number;
        PhysicsWorldGravityY: number;
        PhysicsWorldPixToMeters: number;
        mvc: string;
    }

    export interface roomSettings {
        id: string;
        Height: number;
        inheritRoomSettings: boolean;
        modelName: string;
        persistent: boolean;
        mvc: string;
        Width: number;
    }

    export interface View {
        id: string;
        hborder: number;
        hport: number;
        hspeed: number;
        hview: number;
        inherit: boolean;
        modelName: string;
        objId: string;
        mvc: string;
        vborder: number;
        visible: boolean;
        vspeed: number;
        wport: number;
        wview: number;
        xport: number;
        xview: number;
        yport: number;
        yview: number;
    }

    export interface viewSettings {
        id: string;
        clearDisplayBuffer: boolean;
        clearViewBackground: boolean;
        enableViews: boolean;
        inheritViewSettings: boolean;
        modelName: string;
        mvc: string;
    }

    export interface Sprite {
        /** Resource GUID */
        id: string;

        /** Internal resource type descriptor */
        modelName: string;

        /** Version string, unknown use */
        mvc: string;

        /** Resource name */
        name: string;
    }

    export interface Sound {
        /** Resource GUID */
        id: string;

        /** Internal resource type descriptor */
        modelName: string;

        /** Version string, unknown use */
        mvc: string;

        /** Resource name */
        name: string;

        /** The GUID of the audio group. Unknown where audio group data itself is stored. */
        audioGroupGuid: string;

        /** Quality of the sound, set in the IDE at 8bit or 16bit. */
        bitDepth: number;

        /** The Bit Rate in kbps. */
        bitRate: number;

        /** The "Attribute" of the sound. */
        kind: SoundKind;

        preLoad: boolean;
        sampleRate: number;
        type: SoundType;
        volume: number;
    }

    export interface Path {
        /** Resource GUID */
        id: string;

        /** Internal resource type descriptor */
        modelName: string;

        /** Version string, unknown use */
        mvc: string;

        /** Resource name */
        name: string;

        /** Path closed or open */
        closed: boolean;

        hsnap: number;

        /** Straight or smooth path. */
        kind: PathKind;
        points: Array<PathPoint>;
        precision: number;
        vsnap: 0;
    }

    export interface PathPoint {
        /** Resource GUID */
        id: string;

        /** Internal resource type descriptor */
        modelName: string;

        /** Version string, unknown use */
        mvc: string;

        x: number;
        y: number;
        speed: number;
    }

    export interface View {
        /** Resource GUID */
        id: string;

        /** Internal resource type descriptor */
        modelName: string;

        /** Version string, unknown use */
        mvc: string;

        /** Resource name */
        name: string;
    }

    export interface GMFolder {
        /** Resource GUID */
        id: string;

        /** Internal resource type descriptor */
        modelName: string;

        /** Version string, appears to be 1.0 or 1.1 */
        mvc: string;

        /** Resource name */
        name: string;

        /** An array of the views/resource GUIDs which this folder contains. */
        children: Array<string>;

        /** The FilterType of the View */
        filterType: string;

        /** The folder name itself */
        folderName: string;

        /** Indicates if the view is the Default Node. */
        isDefaultView: boolean;

        /** A code, likely used for adding localizations. */
        localisedFolderName: string;
    }

    export interface Tileset {
        /** Resource GUID */
        id: string;

        /** Internal resource type descriptor */
        modelName: string;

        /** Version string, unknown use */
        mvc: string;

        /** Resource name */
        name: string;
    }

    export interface Script {
        /** Resource GUID */
        id: string;

        /** Internal resource type descriptor */
        modelName: string;

        /** Version string, unknown use */
        mvc: string;

        /** Resource name */
        name: string;

        IsCompatibility: boolean;
        IsDnD: boolean;
    }

    export interface Font {
        /** Resource GUID */
        id: string;

        /** Internal resource type descriptor */
        modelName: "GMFont";

        /** Version string, unknown use */
        mvc: string;

        /** Resource name */
        name: string;

        /** Checks if AntiAliasing is enabled. Not a real boolean, but always 0 or 1. */
        AntiAlias: PseudoBoolean;

        /** Unknown use. Likely related to TTFs */
        TTFName: string;

        bold: boolean;
        charset: number;
        first: number;
        fontName: string;
        glyphs: Array<Glyph>;
        /** Unknown usage. */
        image: null;
        includeTTF: boolean;
        italic: boolean;
        /** Unknown usage. */
        kerningPairs: Array<any>;
        last: number;
        ranges: Array<{
            x: number;
            y: number;
        }>;
        sampleText: string;
        size: number;
        styleName: string;
        textureGroupId: string;
    }

    export interface Glyph {
        Key: number;
        Value: {
            id: string;
            modelName: "GMGlyph";
            mvc: "1.0";
            character: number;
            h: number;
            offset: number;
            shift: number;
            w: number;
            x: number;
            y: number;
        };
    }

    export interface Timeline {
        /** Resource GUID */
        id: string;

        /** Internal resource type descriptor */
        modelName: string;

        /** Version string, unknown use */
        mvc: string;

        /** Resource name */
        name: string;

        /** Array of "moments" in the timeline */
        momentList: Array<Moment>;
    }

    export interface Moment {
        /** Resource GUID */
        id: string;

        /** Internal resource type descriptor */
        modelName: string;

        /** Version string, unknown use */
        mvc: string;

        /** Always a blank string for Moments. */
        name: string;

        /** Describes the .gml file for each moment. Coded as a Create event. */
        evnt: ObjectEvent;
    }

    export interface Note {
        /** Resource GUID */
        id: string;

        /** Internal resource type descriptor */
        modelName: string;

        /** Version string, unknown use */
        mvc: string;

        /** Resource name */
        name: string;
    }

    export interface Extension {
        /** Resource GUID */
        id: string;

        /** Internal resource type descriptor */
        modelName: string;

        /** Version string, unknown use */
        mvc: string;

        /** Resource name */
        name: string;
    }

    export interface Shader {
        /** Resource GUID */
        id: string;

        /** Internal resource type descriptor */
        modelName: string;

        /** Version string, unknown use */
        mvc: string;

        /** Resource name */
        name: string;

        /** Shader language used. */
        type: ShaderLanguageType;
    }
}

/** Parent project entry of a YYP */
export interface ParentProject {
    /** GUID of the parent project */
    id: string;

    /** Describes object entry type, which is always "GMProjectParent" for ParentProjects */
    modelName: string;

    /** A version number string, unknown use */
    mvc: string;

    /** Contains parent project resources */
    alteredResources: Array<YYPResource>;

    /** Unkown property, usually an empty array */
    hiddenResources: Array<YYPResource>;

    /** Contains parent project path presumably, always contains the following string: "${base_project}" */
    projectPath: string;
}

/** Represents a resource entry in a YYP */
export interface YYPResource {
    /** This resource entry GUID (not the GUID of the resource itself). Appears to serve no purpose. */
    Key: string;

    /** Contains resource information */
    Value: {
        /** GUID of the resource */
        id: string;

        /** Describes object entry type, which is always "GMResourceInfo" for YYPResources */
        modelName: string;

        /** A version number string, unknown use */
        mvc: string;

        /** Unknown property, seems to always be an empty array */
        configDeltaFiles: Array<any>;

        /** Unknown property, seems to always be an empty array */
        configDeltas: Array<any>;

        /** Unknown property, seems to always have only one entry: "default" */
        resourceCreationConfigs: Array<string>;

        /** Contains the relative backslash-escaped path to the resource's .yy file */
        resourcePath: string;

        /** Describes the resource type */
        resourceType: string;
    };
}

/** GMS2 project file typings */
export interface YYP {
    /** Contains project GUID */
    id: string;

    /** Usually contains resource type, in this case GMProject */
    modelName: string;

    /** A version number string, unknown use */
    mvc: string;

    /** Denotes whether this project uses drag and drop or not */
    IsDnDProject: boolean;

    /** Unknown property, seems to always be an empty array */
    configs: Array<any>;

    /** Allows for experimental JS editing. Unfinished or legacy feature. It's a secret. */
    option_ecma: boolean;

    /** Parent project, apparently non-public feature */
    parentProject: ParentProject;

    /** Contains all project resources (unordered) */
    resources: Array<YYPResource>;

    /** An array of script GUID's, seemingly optional */
    script_order?: Array<string>;

    /** Unknown property, usually an empty string */
    tutorial?: string;
}
