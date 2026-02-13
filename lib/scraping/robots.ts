import robotsParser from "robots-parser";

import { env } from "@/lib/env";

export interface RobotsDecision {
  allowed: boolean;
  robotsUrl: string;
  reason: string;
}

export async function checkRobotsPermission(pageUrl: string): Promise<RobotsDecision> {
  const target = new URL(pageUrl);
  const robotsUrl = `${target.origin}/robots.txt`;

  try {
    const response = await fetch(robotsUrl, {
      headers: {
        "user-agent": env.SCRAPER_USER_AGENT
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return {
        allowed: true,
        robotsUrl,
        reason: "robots_unavailable"
      };
    }

    const body = await response.text();
    const robots = robotsParser(robotsUrl, body);
    const allowed = robots.isAllowed(pageUrl, env.SCRAPER_USER_AGENT);

    return {
      allowed: allowed !== false,
      robotsUrl,
      reason: allowed === false ? "robots_disallow" : "robots_allow"
    };
  } catch {
    return {
      allowed: true,
      robotsUrl,
      reason: "robots_fetch_failed"
    };
  }
}
