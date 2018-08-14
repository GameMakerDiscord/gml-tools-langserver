/** Namespace describing each ShaderLanguage type option in a ShaderYY file */
export declare namespace ShaderLanguageType {
    const GLSLES: 0;
    const GLSL: 2;
    const HLSL: 4;
}
export declare type ShaderLanguageType = 0 | 2 | 4;

/** Unknown purpose, as opposed to true boolean. Used in Rooms */
export declare namespace PseudoBoolean {
    const False: 0;
    const True: 1;
}
export declare type PseudoBoolean = 0 | 1;

/** Sound 'kind' used in a SoundYY file */
export declare namespace SoundKind {
    const UncompressedNotStreamed: 0;
    const CompressedNotStreamed: 1;
    const UncompressOnLoad: 2;
    const CompressedStreamed: 3;
}
export declare type SoundKind = 0 | 1 | 2 | 3;

/** Sound 'type' used in a SoundYY file */
export declare namespace SoundType {
    const Mono: 0;
    const Stereo: 1;
    const ThreeDee: 2;
}
export declare type SoundType = 0 | 1 | 2;

/** Path 'kind' used in a PathYY file */
export declare namespace PathKind {
    const Straight: 0;
    const Smooth: 1;
}
export declare type PathKind = 0 | 1;

/** Event 'type' used in  Events inside ObjectYY files. Within each 'type'
 *  there is also a `number` which describes a "sub-type" of the event.
 *  Use `EventNumber` for that subtype.
 */
export declare namespace EventType {
    const Create: 0;
    const Alarm: 1;
    const Destroy: 2;
    const Step: 3;
    const Collision: 4;
    const Keyboard: 5;
    const Mouse: 6;
    const Other: 7;
    const Draw: 8;
    const KeyPress: 9;
    const KeyRelease: 10;
    const Trigger: 11;
    const CleanUp: 12;
    const Gesture: 13;
}
export declare type EventType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

/**
 * Event `number` used in Events in ObjectYY files. Each
 * `EventType` only has some of these members.
 */
export declare namespace EventNumber {
    const Create: 0;
    const DrawNormal: 0;
    const DrawBegin: 72;
    const DrawEnd: 73;
    const DrawPre: 76;
    const DrawPost: 77;
    const LeftButton: 0;
    const RightButton: 1;
    const MiddleButton: 2;
    const NoButton: 3;
    const LeftPress: 4;
    const RightPress: 5;
    const MiddlePress: 6;
    const LeftRelease: 7;
    const RightRelease: 8;
    const MiddleRelease: 9;
    const MouseEnter: 10;
    const MouseLeave: 11;
    const MouseWheelUp: 60;
    const MouseWheelDown: 61;
    const GlobalLeftButton: 50;
    const GlobalRightButton: 51;
    const GlobalMiddleButton: 52;
    const GlobalLeftPress: 53;
    const GlobalRightPress: 54;
    const GlobalMiddlePress: 55;
    const GlobalLeftRelease: 56;
    const GlobalRightRelease: 57;
    const GlobalMiddleRelease: 58;
    const Joystick1Left: 16;
    const Joystick1Right: 17;
    const Joystick1Up: 18;
    const Joystick1Down: 19;
    const Joystick1Button1: 21;
    const Joystick1Button2: 22;
    const Joystick1Button3: 23;
    const Joystick1Button4: 24;
    const Joystick1Button5: 25;
    const Joystick1Button6: 26;
    const Joystick1Button7: 27;
    const Joystick1Button8: 28;
    const Joystick2Left: 31;
    const Joystick2Right: 32;
    const Joystick2Up: 33;
    const Joystick2Down: 34;
    const Joystick2Button1: 36;
    const Joystick2Button2: 37;
    const Joystick2Button3: 38;
    const Joystick2Button4: 39;
    const Joystick2Button5: 40;
    const Joystick2Button6: 41;
    const Joystick2Button7: 42;
    const Joystick2Button8: 43;
    const Outside: 0;
    const Boundary: 1;
    const GameStart: 2;
    const GameEnd: 3;
    const RoomStart: 4;
    const RoomEnd: 5;
    const NoMoreLives: 6;
    const AnimationEnd: 7;
    const EndOfPath: 8;
    const NoMoreHealth: 9;
    const CloseButton: 30;
    const User0: 10;
    const User1: 11;
    const User2: 12;
    const User3: 13;
    const User4: 14;
    const User5: 15;
    const User6: 16;
    const User7: 17;
    const User8: 18;
    const User9: 19;
    const User10: 20;
    const User11: 21;
    const User12: 22;
    const User13: 23;
    const User14: 24;
    const User15: 25;
    const StepNormal: 0;
    const StepBegin: 1;
    const StepEnd: 2;
    const Gui: 64;
    const GuiBegin: 74;
    const GuiEnd: 7;
}
export declare type EventNumber = 72 | 73 | 76 | 77 | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 60 | 61 | 50 | 51 | 52 | 53 | 54 | 55 | 56 | 57 | 58 | 16 | 17 | 18 | 19 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 31 | 32 | 33 | 34 | 36 | 37 | 38 | 39 | 40 | 41 | 42 | 43 | 64 | 74 | 7; 

/** Resource file namespace */
export declare namespace Resource {
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
