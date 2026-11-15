interface QAPauseAttributes {
    sectionId?: string | null;
    sectionTitle?: string;
}
declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        qaPauseMarker: {
            insertQAPause: (attributes: QAPauseAttributes) => ReturnType;
        };
    }
}
interface VerseLookupResult {
    reference: string;
    text: string;
}
export interface VerseLookupThoughtState {
    from: number;
    to: number;
    verses: VerseLookupResult[];
}
export declare function pasteClipboardTextIntoEditor(): Promise<boolean>;
export declare function extractText(node: TipTapJsonNode | null | undefined): string;
export declare function showPreview(): void;
export {};
