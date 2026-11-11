import { apiError } from "../errors";
import { invalidProviderResponse, providerObject, requestAiProvider } from "./aiProvider";

/** Fetches the exact saved X post, preferring the full text of long posts. */
export async function getXPostText(bearerToken: string, xPostId: string): Promise<string> {
  if (!/^[1-9]\d{0,18}$/.test(xPostId))
    throw apiError("invalid_state", { reason: "x_post_id_invalid" });
  const response = await requestAiProvider(
    "x",
    `https://api.x.com/2/tweets/${xPostId}?tweet.fields=note_post`,
    { headers: { Authorization: `Bearer ${bearerToken}` } },
  );
  const post = providerObject(response.data, "x");
  const text = post.note_post === undefined ? post.text : providerObject(post.note_post, "x").text;
  if (post.id !== xPostId || typeof text !== "string") throw invalidProviderResponse("x");
  return text;
}
