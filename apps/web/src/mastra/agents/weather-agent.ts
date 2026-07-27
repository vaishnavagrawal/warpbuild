import { Agent } from "@mastra/core/agent";
import { weatherTool } from "../tools/weather-tool";

export const weatherAgent = new Agent({
  id: "weather-agent",
  name: "Weather Agent",
  instructions:
    "You are a helpful weather assistant that provides current weather information for any location. Use the weather tool to get weather data and present it in a friendly, informative way.",
  model: "openai/gpt-4o-mini",
  tools: { weatherTool },
});
