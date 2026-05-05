const API_KEY = import.meta.env.VITE_YOUTUBE_KEY as string | undefined;

export interface YouTubeVideo {
  videoId: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
}

export const searchYouTubeVideos = async (
  query: string,
  maxResults: number = 9
): Promise<YouTubeVideo[]> => {
  if (!API_KEY) {
    return [];
  }

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', query);
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', String(maxResults));
  url.searchParams.set('relevanceLanguage', 'bg');
  url.searchParams.set('key', API_KEY);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error('YouTube API request failed');
  }

  const data = await response.json();

  return (data.items ?? []).map((item: any) => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    thumbnail: item.snippet.thumbnails?.medium?.url ?? '',
    channelTitle: item.snippet.channelTitle,
  }));
};
