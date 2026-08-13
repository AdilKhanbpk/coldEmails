import OpenAI from "openai";

// Initialize the OpenAI client pointing to Nvidia's endpoint
const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY || "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",
  baseURL: "https://integrate.api.nvidia.com/v1" // Standard OpenAI-compatible Nvidia base URL
});

async function main() {
  try {
    // Complex prompt requiring logical breakdown, math, and system design
    const complexPrompt = `
      Scenario: You are designing a globally distributed, real-time bidding system for ad tech.
      
      Constraints & Data:
      1. Peak traffic is 500,000 requests per second (RPS).
      2. Each bidding decision must be completed within a strict 50ms hard timeout window.
      3. Network latency between the user and your nearest regional data center takes 15ms.
      4. The database lookups take 10ms.
      
      Questions:
      1. Calculate exactly how much budget time (in milliseconds) is left for the core AI inference logic.
      2. Suggest the optimal architectural pattern (e.g., edge compute, caching strategies, or message queues) to ensure you never violate the 50ms constraint.
      3. Briefly explain the trade-offs of your suggested approach.
    `;

    console.log("Sending complex request to Nvidia NIM...");

    const response = await openai.chat.completions.create({
      model: "nvidia/nemotron-3-ultra-550b-a55b",
      messages: [
        { role: "user", content: complexPrompt }
      ],
      temperature: 0.5,
      max_tokens: 1024
    });

    console.log("\n--- Model Response ---");
    console.log(response.choices[0].message.content);

  } catch (error) {
    console.error("Error communicating with the model:", error);
  }
}

main();
