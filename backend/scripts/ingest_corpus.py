"""
Moorcheh corpus ingestion script.
Run once before demo: python -m scripts.ingest_corpus

Uploads pre-extracted clinical protocol chunks to Moorcheh namespace.
"""
import os
import sys
import time
import glob

from dotenv import load_dotenv

load_dotenv()

from moorcheh_sdk import MoorchehClient, ConflictError

NAMESPACE = "aasha-clinical-protocols"

# Pre-extracted clinical protocol chunks with rich metadata
# In production, these would come from PDF extraction of WHO/FIGO guidelines
CLINICAL_CHUNKS = [
    # --- Preeclampsia / Eclampsia ---
    {
        "id": "who_pe_2011_001",
        "text": "Preeclampsia is defined as new onset of hypertension (systolic blood pressure ≥140 mmHg or diastolic ≥90 mmHg) after 20 weeks of gestation with proteinuria or other maternal organ dysfunction. Severe preeclampsia is characterized by severe hypertension (≥160/110 mmHg) or evidence of end-organ damage.",
        "metadata": {"source": "WHO Pre-eclampsia Guidelines 2011", "section": "Definition", "condition": "preeclampsia"}
    },
    {
        "id": "who_pe_2011_002",
        "text": "Warning signs of severe preeclampsia include: persistent severe headache not relieved by simple analgesics, visual disturbances (blurred vision, scotomata, photopsia), upper abdominal or epigastric pain, sudden edema of face and hands, hyperreflexia with clonus, oliguria, and nausea or vomiting.",
        "metadata": {"source": "WHO Pre-eclampsia Guidelines 2011", "section": "Warning Signs", "condition": "preeclampsia"}
    },
    {
        "id": "who_pe_2011_003",
        "text": "Magnesium sulfate is the drug of choice for the prevention and treatment of eclampsia. Loading dose: 4g IV over 20 minutes, followed by maintenance of 1g/hour for 24 hours. In low-resource settings where IV is not available, IM administration is acceptable.",
        "metadata": {"source": "WHO Pre-eclampsia Guidelines 2011", "section": "Treatment", "condition": "eclampsia"}
    },
    {
        "id": "who_pe_2011_004",
        "text": "Risk factors for preeclampsia include: nulliparity (first pregnancy), previous history of preeclampsia, chronic hypertension, diabetes mellitus, renal disease, autoimmune disorders, multiple pregnancy, maternal age >35 or <18 years, obesity, and family history of preeclampsia.",
        "metadata": {"source": "WHO Pre-eclampsia Guidelines 2011", "section": "Risk Factors", "condition": "preeclampsia"}
    },
    {
        "id": "who_pe_2011_005",
        "text": "Women with preeclampsia should be referred to a facility capable of managing severe preeclampsia and eclampsia. Delivery is the definitive treatment. In severe preeclampsia at <34 weeks, corticosteroids for fetal lung maturity should be given before delivery if possible.",
        "metadata": {"source": "WHO Pre-eclampsia Guidelines 2011", "section": "Referral", "condition": "preeclampsia"}
    },
    {
        "id": "who_pe_2011_006",
        "text": "Normal edema in pregnancy typically involves the ankles and lower legs, worsening with prolonged standing. Pathological edema suggesting preeclampsia involves the face and hands, is sudden in onset, and is often accompanied by rapid weight gain (>1 kg per week).",
        "metadata": {"source": "WHO Pre-eclampsia Guidelines 2011", "section": "Clinical Assessment", "condition": "preeclampsia"}
    },
    {
        "id": "who_pe_2011_007",
        "text": "Postpartum preeclampsia can occur up to 6 weeks after delivery, with highest risk in the first 48 hours. Women presenting with headache, visual disturbances, or seizures in the postpartum period should be evaluated for preeclampsia/eclampsia regardless of prior diagnosis.",
        "metadata": {"source": "WHO Pre-eclampsia Guidelines 2011", "section": "Postpartum", "condition": "preeclampsia"}
    },
    # --- FIGO Hypertensive Disorders ---
    {
        "id": "figo_hd_2019_001",
        "text": "The FIGO classification of hypertensive disorders in pregnancy includes: chronic hypertension, gestational hypertension, preeclampsia (de novo or superimposed on chronic hypertension), and white-coat hypertension. Each requires different monitoring and management approaches.",
        "metadata": {"source": "FIGO Hypertensive Disorders Guidelines 2019", "section": "Classification", "condition": "hypertension"}
    },
    {
        "id": "figo_hd_2019_002",
        "text": "Women with chronic hypertension are at 3-5 times increased risk of developing superimposed preeclampsia. Features suggesting superimposed preeclampsia include: sudden worsening of hypertension, new proteinuria or sudden increase, new symptoms (headache, visual disturbances, epigastric pain), and thrombocytopenia.",
        "metadata": {"source": "FIGO Hypertensive Disorders Guidelines 2019", "section": "Chronic Hypertension", "condition": "hypertension"}
    },
    {
        "id": "figo_hd_2019_003",
        "text": "Visual disturbances, severe headache, epigastric pain, and sudden facial edema together indicate severe preeclampsia requiring urgent evaluation regardless of blood pressure reading availability. In low-resource settings where blood pressure cannot be measured, these clinical signs alone warrant emergency referral.",
        "metadata": {"source": "FIGO Hypertensive Disorders Guidelines 2019", "section": "Warning Signs", "condition": "preeclampsia"}
    },
    {
        "id": "figo_hd_2019_004",
        "text": "Third trimester (28+ weeks) is the highest risk period for preeclampsia development. Primigravidae at this gestational age with any combination of headache, visual changes, and edema should be considered high-risk and monitored closely.",
        "metadata": {"source": "FIGO Hypertensive Disorders Guidelines 2019", "section": "Timing", "condition": "preeclampsia"}
    },
    # --- Postpartum Hemorrhage ---
    {
        "id": "who_pph_2012_001",
        "text": "Primary postpartum hemorrhage (PPH) is defined as blood loss of 500 mL or more within 24 hours after birth. Severe PPH is blood loss of 1000 mL or more. The most common cause is uterine atony (70-80% of cases).",
        "metadata": {"source": "WHO PPH Guidelines 2012", "section": "Definition", "condition": "postpartum_hemorrhage"}
    },
    {
        "id": "who_pph_2012_002",
        "text": "Warning signs of PPH detectable by patient self-report include: soaking more than one pad per hour, passing large blood clots, feeling dizzy or faint, increasing heart rate, and continuous bright red bleeding beyond the first 24 hours.",
        "metadata": {"source": "WHO PPH Guidelines 2012", "section": "Warning Signs", "condition": "postpartum_hemorrhage"}
    },
    {
        "id": "who_pph_2012_003",
        "text": "Secondary PPH occurs between 24 hours and 12 weeks postpartum, most commonly between days 4-14. Causes include subinvolution of the placental site, retained products of conception, and infection. Presentation includes bright red bleeding that persists or worsens after initial decrease.",
        "metadata": {"source": "WHO PPH Guidelines 2012", "section": "Secondary PPH", "condition": "postpartum_hemorrhage"}
    },
    {
        "id": "who_pph_2012_004",
        "text": "Risk factors for PPH include: previous PPH, prolonged or augmented labor, multiple pregnancy, polyhydramnios, grand multiparity, uterine fibroids, placenta previa, placental abruption, and coagulation disorders.",
        "metadata": {"source": "WHO PPH Guidelines 2012", "section": "Risk Factors", "condition": "postpartum_hemorrhage"}
    },
    {
        "id": "who_pph_2012_005",
        "text": "Community-level management of PPH: uterine massage, ensuring bladder is empty, initiating IV fluids if available, giving misoprostol 800mcg sublingual if oxytocin unavailable, keeping patient warm, and arranging immediate transfer to facility with surgical capability.",
        "metadata": {"source": "WHO PPH Guidelines 2012", "section": "Community Management", "condition": "postpartum_hemorrhage"}
    },
    # --- FIGO PPH ---
    {
        "id": "figo_pph_2022_001",
        "text": "Uterine atony is the leading cause of primary PPH globally, responsible for approximately 70% of cases. Community health workers should be trained to perform uterine massage and recognize the soft, boggy uterus as a sign of atony.",
        "metadata": {"source": "FIGO PPH Guidelines 2022", "section": "Etiology", "condition": "postpartum_hemorrhage"}
    },
    {
        "id": "figo_pph_2022_002",
        "text": "In remote settings, the 'soaking test' can help patients self-monitor: soaking through more than one sanitary pad per hour for two consecutive hours is a danger sign requiring immediate medical attention.",
        "metadata": {"source": "FIGO PPH Guidelines 2022", "section": "Self-Monitoring", "condition": "postpartum_hemorrhage"}
    },
    # --- Postpartum Sepsis ---
    {
        "id": "who_mcpc_2017_001",
        "text": "Postpartum sepsis is a life-threatening condition defined as infection of the genital tract occurring at any time between rupture of membranes or labor and the 42nd day postpartum. Puerperal sepsis typically presents between days 2-10 after delivery.",
        "metadata": {"source": "WHO MCPC", "section": "Definition", "condition": "postpartum_sepsis"}
    },
    {
        "id": "who_mcpc_2017_002",
        "text": "Warning signs of postpartum sepsis include: fever (>38°C), chills and rigors, lower abdominal pain, foul-smelling vaginal discharge, uterine tenderness, general malaise and weakness, and tachycardia. Fever combined with any single additional symptom warrants urgent evaluation.",
        "metadata": {"source": "WHO MCPC", "section": "Warning Signs", "condition": "postpartum_sepsis"}
    },
    {
        "id": "who_mcpc_2017_003",
        "text": "Risk factors for postpartum sepsis include: prolonged rupture of membranes (>18 hours), multiple vaginal examinations during labor, operative delivery, retained products of conception, anemia, poor nutrition, and poor hygiene during delivery.",
        "metadata": {"source": "WHO MCPC", "section": "Risk Factors", "condition": "postpartum_sepsis"}
    },
    {
        "id": "who_mcpc_2017_004",
        "text": "Community health worker response to suspected postpartum sepsis: assess vital signs, begin oral antibiotics if available (amoxicillin-clavulanate), encourage oral fluids, and arrange immediate referral to health facility. Do not delay referral for antibiotic administration.",
        "metadata": {"source": "WHO MCPC", "section": "CHW Response", "condition": "postpartum_sepsis"}
    },
    # --- Reduced Fetal Movement ---
    {
        "id": "who_anc_2016_001",
        "text": "Reduced fetal movement (RFM) becomes clinically significant from 28 weeks gestation when regular patterns are typically established. Women should be advised to be aware of their baby's individual pattern of movement rather than counting to a specific number.",
        "metadata": {"source": "WHO ANC Recommendations 2016", "section": "Fetal Movement", "condition": "reduced_fetal_movement"}
    },
    {
        "id": "who_anc_2016_002",
        "text": "Management of reported reduced fetal movement in remote settings: reassure the mother, advise lying on left side and drinking cold water, then monitoring for movement over 2 hours. If no improvement, the woman should be assessed in person with auscultation of fetal heart rate.",
        "metadata": {"source": "WHO ANC Recommendations 2016", "section": "RFM Management", "condition": "reduced_fetal_movement"}
    },
    {
        "id": "who_anc_2016_003",
        "text": "Absent fetal movement (no perceived movement for 12+ hours) is an emergency requiring immediate in-person assessment. Community health workers should be dispatched immediately to perform fetal heart rate auscultation and facilitate transfer if needed.",
        "metadata": {"source": "WHO ANC Recommendations 2016", "section": "Emergency", "condition": "reduced_fetal_movement"}
    },
    # --- General ANC ---
    {
        "id": "who_anc_2016_004",
        "text": "WHO recommends a minimum of 8 antenatal care contacts to reduce perinatal mortality and improve women's experience of care. In low-resource settings where facility visits are limited, community health worker home visits and remote monitoring can supplement facility-based ANC.",
        "metadata": {"source": "WHO ANC Recommendations 2016", "section": "Contact Schedule", "condition": "general_anc"}
    },
    {
        "id": "who_anc_2016_005",
        "text": "Danger signs in pregnancy that require immediate facility referral include: vaginal bleeding, severe headache with blurred vision, high fever, severe abdominal pain, reduced or absent fetal movement, gush of fluid from vagina (premature rupture of membranes), and swelling of face and hands.",
        "metadata": {"source": "WHO ANC Recommendations 2016", "section": "Danger Signs", "condition": "general_anc"}
    },
    {
        "id": "who_anc_2016_006",
        "text": "First pregnancy (primigravida) carries higher risks for several complications including preeclampsia, obstructed labor, and postpartum hemorrhage. Primigravidae should be monitored more closely, especially in the third trimester.",
        "metadata": {"source": "WHO ANC Recommendations 2016", "section": "Primigravida", "condition": "general_anc"}
    },
    {
        "id": "who_anc_2016_007",
        "text": "Blood pressure measurement is a critical component of antenatal care. In settings where blood pressure cannot be measured, clinical symptoms serve as proxy indicators: persistent headache, visual disturbances, and facial/hand edema should be treated as potential hypertensive emergency.",
        "metadata": {"source": "WHO ANC Recommendations 2016", "section": "Blood Pressure", "condition": "hypertension"}
    },
    {
        "id": "who_anc_2016_008",
        "text": "Anemia in pregnancy (hemoglobin <11 g/dL) increases the risk of postpartum hemorrhage, preterm birth, and low birth weight. Women reporting extreme fatigue, pallor, or breathlessness on exertion should be screened for anemia.",
        "metadata": {"source": "WHO ANC Recommendations 2016", "section": "Anemia", "condition": "anemia"}
    },
    {
        "id": "who_anc_2016_009",
        "text": "Gestational diabetes screening should be offered between 24-28 weeks gestation. Risk factors include: previous gestational diabetes, family history of diabetes, BMI >30, previous macrosomic baby, and age >35 years.",
        "metadata": {"source": "WHO ANC Recommendations 2016", "section": "Diabetes", "condition": "gestational_diabetes"}
    },
    {
        "id": "who_anc_2016_010",
        "text": "Women should be counseled about the expected pattern of normal pregnancy: common discomforts (nausea in first trimester, backache, ankle swelling), expected weight gain patterns, and the importance of nutrition and rest.",
        "metadata": {"source": "WHO ANC Recommendations 2016", "section": "Counseling", "condition": "general_anc"}
    },
    {
        "id": "who_anc_2016_011",
        "text": "Multiple gestation (twins, triplets) carries significantly increased risks including preeclampsia (3x risk), preterm birth (50% of twins), gestational diabetes, and postpartum hemorrhage. Close monitoring with increased frequency of contacts is recommended.",
        "metadata": {"source": "WHO ANC Recommendations 2016", "section": "Multiple Gestation", "condition": "multiple_gestation"}
    },
    {
        "id": "who_anc_2016_012",
        "text": "Women with a history of preeclampsia in a previous pregnancy have a 15-25% risk of recurrence. This risk is higher with earlier onset in the previous pregnancy. Close monitoring should begin from 20 weeks, with increased vigilance from 28 weeks.",
        "metadata": {"source": "WHO ANC Recommendations 2016", "section": "Recurrent Preeclampsia", "condition": "preeclampsia"}
    },
    # --- IMPAC CHW Protocols ---
    {
        "id": "impac_2017_001",
        "text": "Community health workers should conduct systematic symptom screening at each contact using a structured checklist covering: general wellbeing, headache, visual changes, swelling pattern, abdominal pain, fetal movement, fever, and vaginal bleeding or discharge.",
        "metadata": {"source": "IMPAC Guidelines", "section": "CHW Screening", "condition": "general_anc"}
    },
    {
        "id": "impac_2017_002",
        "text": "CHW danger sign recognition protocol: Any combination of two or more danger signs (severe headache, visual disturbances, facial/hand edema, severe abdominal pain, absence of fetal movement, heavy bleeding, high fever) should trigger immediate referral without waiting for further assessment.",
        "metadata": {"source": "IMPAC Guidelines", "section": "Danger Signs Protocol", "condition": "general_anc"}
    },
    {
        "id": "impac_2017_003",
        "text": "Transport planning for obstetric emergencies: every pregnant woman should have a birth preparedness plan including identified transport, saved money for transport, identified blood donor, and knowledge of nearest EmONC facility. CHWs should verify these plans during home visits.",
        "metadata": {"source": "IMPAC Guidelines", "section": "Birth Preparedness", "condition": "general_anc"}
    },
    {
        "id": "impac_2017_004",
        "text": "Postpartum home visits by CHWs should occur within 24 hours of delivery, at day 3, between days 7-14, and at 6 weeks. Key assessments include: maternal temperature, bleeding amount, breast examination, wound assessment if applicable, and newborn examination.",
        "metadata": {"source": "IMPAC Guidelines", "section": "Postpartum Visits", "condition": "postpartum_care"}
    },
    # --- CDC Severe Maternal Morbidity ---
    {
        "id": "cdc_smm_2019_001",
        "text": "CDC severe maternal morbidity indicators include: eclampsia, acute renal failure, pulmonary edema, acute transfusion, hysterectomy, ventilation, sepsis, shock, DIC, and cardiac arrest. These indicators help stratify risk and guide resource allocation in maternal health programs.",
        "metadata": {"source": "CDC Severe Maternal Morbidity Indicators", "section": "Indicators", "condition": "severe_morbidity"}
    },
    {
        "id": "cdc_smm_2019_002",
        "text": "Risk stratification for maternal complications: high-risk factors include age <17 or >35, BMI >40, chronic hypertension, pregestational diabetes, sickle cell disease, HIV, cardiac disease, and prior cesarean delivery. Multiple risk factors compound the overall risk.",
        "metadata": {"source": "CDC Severe Maternal Morbidity Indicators", "section": "Risk Stratification", "condition": "severe_morbidity"}
    },
    {
        "id": "cdc_smm_2019_003",
        "text": "Community-based surveillance systems should track: maternal deaths, near-misses (women who nearly died but survived), and facility referrals. This data enables continuous quality improvement and resource allocation.",
        "metadata": {"source": "CDC Severe Maternal Morbidity Indicators", "section": "Surveillance", "condition": "severe_morbidity"}
    },
    # --- Additional clinical knowledge ---
    {
        "id": "clinical_headache_001",
        "text": "Headache differential diagnosis in pregnancy: tension headache (most common, mild-moderate, bilateral), migraine (often improves in pregnancy), and headache as preeclampsia symptom (severe, persistent, frontal, not relieved by analgesics, associated with other symptoms). New-onset severe headache in third trimester should be treated as preeclampsia until proven otherwise.",
        "metadata": {"source": "WHO MCPC", "section": "Headache Assessment", "condition": "preeclampsia"}
    },
    {
        "id": "clinical_headache_002",
        "text": "Baseline-adjusted headache assessment: A patient who frequently reports mild headaches (frequency >50%) has a different risk profile than one experiencing a first-ever headache. First-ever severe headache in a previously headache-free patient is a stronger indicator of preeclampsia than recurring mild headaches in a patient with established headache history.",
        "metadata": {"source": "Clinical Practice", "section": "Baseline Assessment", "condition": "preeclampsia"}
    },
    {
        "id": "clinical_vision_001",
        "text": "Visual disturbances in pregnancy: blurred vision, scotomata (blind spots), photopsia (flashing lights), and diplopia (double vision) can indicate severe preeclampsia, eclampsia, or other serious conditions. Any visual symptom in the third trimester or postpartum period warrants urgent evaluation.",
        "metadata": {"source": "WHO MCPC", "section": "Visual Assessment", "condition": "preeclampsia"}
    },
    {
        "id": "clinical_edema_001",
        "text": "Edema assessment in pregnancy: physiological edema (normal) is bilateral ankle swelling that worsens with standing and improves with elevation. Pathological edema includes: facial puffiness especially periorbital, hand swelling (rings becoming tight), sudden onset, non-dependent distribution, and associated weight gain >1kg/week. The key distinction for preeclampsia is face and hand involvement.",
        "metadata": {"source": "WHO MCPC", "section": "Edema Assessment", "condition": "preeclampsia"}
    },
    {
        "id": "clinical_bleeding_001",
        "text": "Antepartum hemorrhage assessment: placental abruption presents with painful, dark vaginal bleeding with a tense uterus; placenta previa presents with painless, bright red bleeding. Both are emergencies requiring immediate facility transfer. Any vaginal bleeding after 20 weeks requires evaluation.",
        "metadata": {"source": "WHO MCPC", "section": "Antepartum Bleeding", "condition": "antepartum_hemorrhage"}
    },
    {
        "id": "clinical_fever_001",
        "text": "Fever in pregnancy differential: malaria (in endemic areas), urinary tract infection, upper respiratory infection, chorioamnionitis (fever with uterine tenderness and foul discharge), and other infections. Fever >38°C in the postpartum period combined with any additional symptom (abdominal pain, foul discharge, malaise) should be treated as potential sepsis.",
        "metadata": {"source": "WHO MCPC", "section": "Fever Assessment", "condition": "infection"}
    },
    {
        "id": "clinical_transport_001",
        "text": "Emergency transport considerations for obstetric emergencies: patient should be positioned on left lateral side to prevent supine hypotension, IV access should be established if possible, keep patient warm, bring any available medications, and communicate expected arrival and condition to receiving facility.",
        "metadata": {"source": "IMPAC Guidelines", "section": "Emergency Transport", "condition": "general_anc"}
    },
    {
        "id": "clinical_multiple_001",
        "text": "Multiple concurrent danger signs dramatically increase the probability of a serious condition. For example, the combination of headache + visual changes + edema of face/hands has a positive predictive value of >80% for preeclampsia, even without blood pressure measurement.",
        "metadata": {"source": "Clinical Practice", "section": "Multiple Signs", "condition": "preeclampsia"}
    },
    {
        "id": "clinical_trajectory_001",
        "text": "Symptom trajectory analysis: worsening symptoms over consecutive check-ins (e.g., headache progressing from none to mild to severe) is more concerning than stable symptoms at any level. Rapidly escalating symptom patterns should lower the threshold for escalation even if individual symptoms are not yet severe.",
        "metadata": {"source": "Clinical Practice", "section": "Trajectory", "condition": "general_anc"}
    },
]


def main():
    api_key = os.getenv("MOORCHEH_API_KEY")
    if not api_key:
        print("ERROR: MOORCHEH_API_KEY not set in environment")
        sys.exit(1)

    print(f"Ingesting {len(CLINICAL_CHUNKS)} clinical protocol chunks...")

    with MoorchehClient(api_key=api_key) as client:
        # Create namespace (ignore if already exists)
        try:
            client.namespaces.create(
                namespace_name=NAMESPACE,
                type="text",
            )
            print(f"Created namespace: {NAMESPACE}")
        except ConflictError:
            print(f"Namespace {NAMESPACE} already exists — uploading to existing")

        # Upload in batches of 100
        batch_size = 100
        for i in range(0, len(CLINICAL_CHUNKS), batch_size):
            batch = CLINICAL_CHUNKS[i:i + batch_size]
            client.documents.upload(
                namespace_name=NAMESPACE,
                documents=batch,
            )
            print(f"Uploaded batch {i // batch_size + 1}: {len(batch)} chunks")

        # Wait for async indexing
        print("Waiting for indexing...")
        time.sleep(10)

        # Verify with test queries
        test_queries = [
            "severe headache visual disturbance preeclampsia danger signs",
            "postpartum hemorrhage bleeding warning signs",
            "postpartum fever sepsis infection",
            "reduced fetal movement baby not moving",
            "third trimester primigravida preeclampsia risk",
        ]

        print("\nVerification queries:")
        for q in test_queries:
            results = client.similarity_search.query(
                namespaces=[NAMESPACE],
                query=q,
                top_k=3,
            )
            matches = results.get("matches", [])
            print(f"  '{q[:50]}...' → {len(matches)} results")
            for m in matches:
                print(f"    - [{m.get('score', 0):.3f}] {m['id']} ({m.get('metadata', {}).get('source', '?')})")

    print(f"\nDone! {len(CLINICAL_CHUNKS)} chunks ingested into '{NAMESPACE}'")


if __name__ == "__main__":
    main()
