export type OptionKind = "best" | "video" | "audio" | "mp3";

export interface FormatOption {
  selector: string;
  kind: OptionKind;
  label: string;
  ext: string | null;
  height: number | null;
  fps: number | null;
  vcodec: string | null;
  acodec: string | null;
  filesize: number | null;
  note: string | null;
  recommended?: boolean;
}

export interface ResolvedVideo {
  url: string;
  title: string;
  uploader: string | null;
  duration: number | null;
  thumbnail: string | null;
  extractor: string;
  domain: string;
  viewCount: number | null;
  uploadDate: string | null;
  isLive: boolean;
  videoOptions: FormatOption[];
  audioOptions: FormatOption[];
}

export type JobStatus =
  | "preparing"
  | "downloading"
  | "processing"
  | "ready"
  | "error"
  | "canceled";

export interface JobView {
  id: string;
  status: JobStatus;
  progress: number;
  speed: string | null;
  eta: string | null;
  title: string;
  label: string | null;
  kind: OptionKind;
  selector: string;
  filename: string | null;
  size: number | null;
  error: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ApiError {
  error: string;
}
