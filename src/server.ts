import * as restify from "restify";
import { CloudAdapter, ConfigurationServiceClientCredentialFactory, ConfigurationBotFrameworkAuthentication } from "botbuilder";
import type { Config } from "./config.js";
import { NYNTeamsBot } from "./teams.js";

export function startTeamsServer(config: Config) {
  if (!config.teamsAppId || !config.teamsAppPassword) {
    console.log("⚠️  Teams app credentials not provided, skipping Microsoft Teams integration.");
    return null;
  }

  // Create HTTP server.
  const server = restify.createServer();
  server.use(restify.plugins.bodyParser());

  const port = config.teamsPort || 3978;
  server.listen(port, () => {
    console.log(`\n✅ Microsoft Teams endpoint listening to http://localhost:${port}/api/messages`);
  });

  const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
    MicrosoftAppId: config.teamsAppId,
    MicrosoftAppPassword: config.teamsAppPassword,
    MicrosoftAppType: "MultiTenant" 
  });

  const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication({}, credentialsFactory);
  const adapter = new CloudAdapter(botFrameworkAuthentication);

  // Catch-all for errors.
  adapter.onTurnError = async (context, error) => {
    console.error(`\n [onTurnError] unhandled error: ${error}`);
    await context.sendTraceActivity("OnTurnError Trace", `${error}`, "https://www.botframework.com/schemas/error", "TurnError");
    await context.sendActivity("The bot encountered an error or bug.");
  };

  const myBot = new NYNTeamsBot(config);

  server.post("/api/messages", async (req, res) => {
    // Route received requests to the adapter for processing
    await adapter.process(req, res, (context) => myBot.run(context));
  });

  return server;
}
