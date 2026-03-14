"""
Free-text SMS classification using Claude Haiku.
Converts natural language responses to numeric options.
"""
import logging
import anthropic
from app.core.config import settings

logger = logging.getLogger(__name__)


async def classify_free_text(text: str, node: dict, valid_options: list[str]) -> str | None:
    """
    Classify a free-text SMS response into one of the valid numeric options.
    Uses Claude Haiku for fast classification (≤5s target).
    Returns the matched option string or None if unclassifiable.
    """
    if not text or not valid_options:
        return None

    # Build option descriptions from the message
    message_text = node.get("message", "")
    option_lines = []
    for line in message_text.split("\n"):
        line = line.strip()
        for opt in valid_options:
            if line.startswith(f"{opt} -") or line.startswith(f"{opt} –"):
                option_lines.append(line)

    options_desc = "\n".join(option_lines)

    prompt = f"""A patient sent this SMS reply: "{text}"

The question asked was about: {node.get('key', 'health status')}

The valid response options are:
{options_desc}

Which option number best matches the patient's response? Reply with ONLY the number ({', '.join(valid_options)}) or "UNCLEAR" if the response does not match any option."""

    try:
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=10,
            messages=[{"role": "user", "content": prompt}],
        )
        result = response.content[0].text.strip()

        if result in valid_options:
            logger.info(f"Classified '{text}' as option {result}")
            return result
        else:
            logger.info(f"Could not classify '{text}': got '{result}'")
            return None

    except Exception as e:
        logger.error(f"Classification error: {e}")
        return None
