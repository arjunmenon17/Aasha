"""
Conversation question trees for pregnancy and postpartum check-ins.

Each node has:
  - message: SMS text template
  - key: data key stored in conversation_data
  - type: 'single_number' or 'multi_number'
  - options: valid numeric responses
  - next: function(response) -> next node key or None (complete)
"""

# --- PREGNANCY CHECK-IN TREE ---

PREGNANCY_TREE = {
    "start": {
        "message": (
            "Hi {name}, it's time for your health check-in! "
            "How are you feeling today?\n"
            "1 - Good\n"
            "2 - Not great\n"
            "3 - Unwell"
        ),
        "key": "wellbeing",
        "type": "single_number",
        "options": ["1", "2", "3"],
        "next": lambda r: "headache" if r in ("2", "3") else "fetal_movement",
    },
    "headache": {
        "message": (
            "Have you had any headaches?\n"
            "1 - No headache\n"
            "2 - Mild headache\n"
            "3 - Severe headache"
        ),
        "key": "headache_severity",
        "type": "single_number",
        "options": ["1", "2", "3"],
        "next": lambda r: "headache_duration" if r in ("2", "3") else "vision",
    },
    "headache_duration": {
        "message": (
            "How long has the headache lasted?\n"
            "1 - Less than 1 day\n"
            "2 - 1-2 days\n"
            "3 - More than 2 days"
        ),
        "key": "headache_duration",
        "type": "single_number",
        "options": ["1", "2", "3"],
        "next": lambda r: "vision",
    },
    "vision": {
        "message": (
            "Any changes in your vision?\n"
            "1 - Vision is normal\n"
            "2 - Blurry vision\n"
            "3 - Seeing spots or flashing lights"
        ),
        "key": "vision",
        "type": "single_number",
        "options": ["1", "2", "3"],
        "next": lambda r: "swelling",
    },
    "swelling": {
        "message": (
            "Do you have any swelling?\n"
            "1 - No swelling\n"
            "2 - Ankles only (normal)\n"
            "3 - Face and hands\n"
            "4 - Face, hands, and ankles"
        ),
        "key": "swelling",
        "type": "single_number",
        "options": ["1", "2", "3", "4"],
        "next": lambda r: "abdominal_pain",
    },
    "abdominal_pain": {
        "message": (
            "Any abdominal or belly pain?\n"
            "1 - No pain\n"
            "2 - Mild discomfort\n"
            "3 - Upper belly pain (under ribs)\n"
            "4 - Severe pain"
        ),
        "key": "abdominal_pain",
        "type": "single_number",
        "options": ["1", "2", "3", "4"],
        "next": lambda r: "fetal_movement",
    },
    "fetal_movement": {
        "message": (
            "How is your baby moving?\n"
            "1 - Moving normally\n"
            "2 - Moving less than usual\n"
            "3 - Not felt any movement today"
        ),
        "key": "fetal_movement",
        "type": "single_number",
        "options": ["1", "2", "3"],
        "next": lambda r: "fever" if r in ("2", "3") else "bleeding",
    },
    "fever": {
        "message": (
            "Do you have a fever or feel hot?\n"
            "1 - No fever\n"
            "2 - Mild fever\n"
            "3 - High fever"
        ),
        "key": "fever",
        "type": "single_number",
        "options": ["1", "2", "3"],
        "next": lambda r: "bleeding",
    },
    "bleeding": {
        "message": (
            "Any vaginal bleeding?\n"
            "1 - No bleeding\n"
            "2 - Light spotting\n"
            "3 - Heavy bleeding"
        ),
        "key": "bleeding",
        "type": "single_number",
        "options": ["1", "2", "3"],
        "next": lambda r: None,  # Complete
    },
    # Healthy shortcut — if feeling good, skip symptom details
    "fetal_movement_good": {
        "message": (
            "How is your baby moving?\n"
            "1 - Moving normally\n"
            "2 - Moving less than usual\n"
            "3 - Not felt any movement today"
        ),
        "key": "fetal_movement",
        "type": "single_number",
        "options": ["1", "2", "3"],
        "next": lambda r: None if r == "1" else "fever",
    },
}

# Override: if patient said "Good" at start, use shortened path
PREGNANCY_TREE["start"]["next"] = lambda r: "headache" if r in ("2", "3") else "fetal_movement_good"


# --- POSTPARTUM CHECK-IN TREE ---

POSTPARTUM_TREE = {
    "start": {
        "message": (
            "Hi {name}, how are you and your baby doing today?\n"
            "1 - We are both well\n"
            "2 - I have some concerns\n"
            "3 - I need help"
        ),
        "key": "wellbeing",
        "type": "single_number",
        "options": ["1", "2", "3"],
        "next": lambda r: "bleeding_pp" if r in ("2", "3") else None,
    },
    "bleeding_pp": {
        "message": (
            "How is your bleeding?\n"
            "1 - Light or decreasing\n"
            "2 - Soaking more than 1 pad per hour\n"
            "3 - Large clots or bright red blood"
        ),
        "key": "bleeding",
        "type": "single_number",
        "options": ["1", "2", "3"],
        "next": lambda r: "fever_pp",
    },
    "fever_pp": {
        "message": (
            "Do you have a fever or feel hot?\n"
            "1 - No fever\n"
            "2 - Mild fever\n"
            "3 - High fever or chills"
        ),
        "key": "fever",
        "type": "single_number",
        "options": ["1", "2", "3"],
        "next": lambda r: "discharge_pp",
    },
    "discharge_pp": {
        "message": (
            "How is your vaginal discharge?\n"
            "1 - Normal (no bad smell)\n"
            "2 - Bad smell or unusual color\n"
            "3 - Very foul smelling"
        ),
        "key": "discharge",
        "type": "single_number",
        "options": ["1", "2", "3"],
        "next": lambda r: "pain_pp",
    },
    "pain_pp": {
        "message": (
            "Any belly pain?\n"
            "1 - No pain or mild cramping\n"
            "2 - Moderate pain\n"
            "3 - Severe lower belly pain"
        ),
        "key": "abdominal_pain",
        "type": "single_number",
        "options": ["1", "2", "3"],
        "next": lambda r: "headache_pp",
    },
    "headache_pp": {
        "message": (
            "Any headaches or vision changes?\n"
            "1 - None\n"
            "2 - Headache\n"
            "3 - Headache with vision changes"
        ),
        "key": "headache_vision",
        "type": "single_number",
        "options": ["1", "2", "3"],
        "next": lambda r: "baby_feeding",
    },
    "baby_feeding": {
        "message": (
            "How is your baby feeding?\n"
            "1 - Feeding well\n"
            "2 - Some difficulty\n"
            "3 - Not feeding or very weak"
        ),
        "key": "baby_feeding",
        "type": "single_number",
        "options": ["1", "2", "3"],
        "next": lambda r: None,  # Complete
    },
}


def get_tree(patient_status: str) -> dict:
    """Return the appropriate question tree based on patient status."""
    if patient_status == "postpartum":
        return POSTPARTUM_TREE
    return PREGNANCY_TREE
