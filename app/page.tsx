import { VideoDownloader } from "@/components/video-downloader";

export default function Home() {
  return <VideoDownloader serverLocal={!process.env.VERCEL} />;
}
