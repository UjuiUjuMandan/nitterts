import type { CookieSession } from "../session";
import { parseProfile, type Profile } from "./profile";
import { fetchTidPair, generateTransactionId } from "./tid";

const GRAPH_USER = "Gb-d6r0vxPOADdG62OEBpQ/UserByScreenName";
const BEARER_TOKEN =
  "Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D" +
  "1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
const MAX_RESPONSE_BYTES = 1024 * 1024;

const FEATURES = {
  rweb_video_screen_enabled: false,
  rweb_cashtags_enabled: true,
  profile_label_improvements_pcf_label_in_post_enabled: true,
  responsive_web_profile_redirect_enabled: false,
  rweb_tipjar_consumption_enabled: false,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  premium_content_api_read_enabled: false,
  communities_web_enable_tweet_community_results_fetch: true,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  c9s_list_members_action_api_enabled: false,
  c9s_superc9s_indication_enabled: false,
  responsive_web_grok_analyze_button_fetch_trends_enabled: false,
  responsive_web_grok_analyze_post_followups_enabled: true,
  rweb_cashtags_composer_attachment_enabled: true,
  responsive_web_jetfuel_frame: true,
  responsive_web_grok_share_attachment_enabled: true,
  responsive_web_grok_annotations_enabled: true,
  articles_preview_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  rweb_conversational_replies_downvote_enabled: false,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  content_disclosure_indicator_enabled: true,
  content_disclosure_ai_generated_indicator_enabled: true,
  responsive_web_grok_show_grok_translated_post: true,
  responsive_web_grok_analysis_button_from_backend: true,
  post_ctas_fetch_enabled: true,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: false,
  responsive_web_grok_image_annotation_enabled: true,
  responsive_web_grok_imagine_annotation_enabled: true,
  responsive_web_grok_community_note_auto_translation_is_enabled: true,
  responsive_web_enhance_cards_enabled: false,
};

const FIELD_TOGGLES = {
  withArticleRichContentState: true,
  withArticlePlainText: false,
  withGrokAnalyze: false,
  withDisallowedReplyControls: false,
};

export async function fetchProfile(
  username: string,
  session: CookieSession,
): Promise<Profile> {
  const value = await fetchGraphql(
    GRAPH_USER,
    { screen_name: username, withGrokTranslatedBio: false },
    FIELD_TOGGLES,
    session,
  );
  return parseProfile(value);
}

export async function fetchGraphql(
  operation: string,
  variables: Record<string, unknown>,
  fieldToggles: Record<string, boolean>,
  session: CookieSession,
): Promise<unknown> {
  const path = `/i/api/graphql/${operation}`;
  const url = new URL(`https://x.com${path}`);
  url.searchParams.set("variables", JSON.stringify(variables));
  url.searchParams.set("features", JSON.stringify(FEATURES));
  url.searchParams.set("fieldToggles", JSON.stringify(fieldToggles));

  const pair = await fetchTidPair();
  const transactionId = await generateTransactionId(path, pair);
  const response = await fetch(url, {
    redirect: "manual",
    headers: {
      accept: "*/*",
      "accept-encoding": "gzip",
      "accept-language": "en-US,en;q=0.9",
      authorization: BEARER_TOKEN,
      "content-type": "application/json",
      cookie: `auth_token=${session.authToken}; ct0=${session.ct0}`,
      origin: "https://x.com",
      priority: "u=1, i",
      referer: "https://x.com/",
      "sec-ch-ua": '"Google Chrome";v="142", "Chromium";v="142", "Not A(Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-origin",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      "x-client-transaction-id": transactionId,
      "x-csrf-token": session.ct0,
      "x-twitter-active-user": "yes",
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-client-language": "en",
    },
  });

  const body = await readTextLimited(response, MAX_RESPONSE_BYTES);
  if (!response.ok) {
    throw new XApiError(response.status, summarizeError(body));
  }

  let value: unknown;
  try {
    value = JSON.parse(body);
  } catch {
    throw new Error("X returned a non-JSON GraphQL response");
  }
  return value;
}

export class XApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "XApiError";
  }
}

async function readTextLimited(response: Response, limit: number): Promise<string> {
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = "";
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > limit) throw new Error("X profile response is too large");
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    await reader.cancel();
  }
}

function summarizeError(body: string): string {
  try {
    const value = JSON.parse(body) as { errors?: Array<{ message?: unknown }> };
    const message = value.errors?.[0]?.message;
    return typeof message === "string" ? message : "X API request failed";
  } catch {
    return "X API request failed";
  }
}
