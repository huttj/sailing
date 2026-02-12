/**
 * DataLoader — fetches idea, post, and topic data from JSON files.
 */

export async function loadData() {
  const [ideasResponse, postsResponse, topicsResponse] = await Promise.all([
    fetch('data/ideas.json'),
    fetch('data/posts.json'),
    fetch('data/topics.json'),
  ]);

  if (!ideasResponse.ok) {
    throw new Error(`Failed to load ideas.json: ${ideasResponse.status}`);
  }
  if (!postsResponse.ok) {
    throw new Error(`Failed to load posts.json: ${postsResponse.status}`);
  }
  if (!topicsResponse.ok) {
    throw new Error(`Failed to load topics.json: ${topicsResponse.status}`);
  }

  const ideas = await ideasResponse.json();
  const posts = await postsResponse.json();
  const topics = await topicsResponse.json();

  return { ideas, posts, topics };
}
