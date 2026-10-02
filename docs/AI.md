# Optional open-weight assistant

The app works without a model endpoint.
The local guide gives a fixed practice plan from the supplied topic and round type.
The guide does not evaluate the candidate.

## Connect a model

Use an OpenAI-compatible chat completion server.
vLLM is one option. The owner selects the model and reviews its license.
The repository includes no model weights.

Set `AI_BASE_URL`, `AI_MODEL`, and the endpoint credential if the server needs one.
The base URL usually ends in `/v1`.
The adapter calls `/chat/completions` under that base URL.

```dotenv
AI_BASE_URL=https://your-model-service.example/v1
AI_MODEL=your-reviewed-model-name
AI_API_KEY=your-server-side-key
```

## Boundaries

The candidate must consent before the app sends a topic to a configured model.
The app sends only the topic and round type.
The app does not send applications, account profiles, or payment records.
The adapter limits topic length, output tokens, response length, request rate, and timeout.
The app renders output as escaped text.

The system instruction rejects candidate scores and hire decisions.
A prompt is not a complete security boundary. A model can still return wrong or unsuitable text.
Review model behavior and data retention before live use.
Use a general practice topic without personal identifiers.

See [vLLM's compatible server guide](https://docs.vllm.ai/en/latest/serving/openai_compatible_server/) for endpoint details.
