export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type AnnotationType = 'highlight' | 'note';

export interface Annotation {
  id: string;
  type: AnnotationType;
  page: number; // 1-indexed
  color: string;
  rects?: NormRect[]; // present for highlights, normalized to page size (0-1)
  x?: number; // present for notes, normalized to page size (0-1)
  y?: number;
  quotedText?: string;
  comment: string;
  author: string;
  createdAt: number;
}

export interface DocumentRecord {
  id: string; // sha-256 of file bytes
  name: string;
  bytes: ArrayBuffer;
  createdAt: number;
}

export interface ShareBlob {
  docName: string;
  pdfUrl: string;
  annotations: Annotation[];
  updatedAt: number;
}
