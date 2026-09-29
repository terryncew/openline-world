"""DISCOVERY-ROOM-001 frontend demo driver.

Drives the full research-question loop through the REAL UI (no mocks):
  researcher posts a research-question listing with the disclosure set
  -> contributor (deterministic worker) proposes an agreement
  -> real refusals are triggered and shown (submit-before-agree,
     agree-as-non-counterpart)
  -> researcher (counterpart) agrees
  -> contributor submits -> receiver verifies -> gate-signed result shown

Screenshots land in research/rooms/discovery-room-001/capture/.
"""
import os
import sys
import time

import os

from playwright.sync_api import sync_playwright

# Headed Firefox under Xvfb (:99): the only configuration where WebGL2 and
# native Ed25519 WebCrypto both work, so the real join ceremony runs.
os.environ.setdefault("DISPLAY", ":99")

BASE = "http://localhost:5193"
CAP = "/home/hatch/workspace/openline-world/research/rooms/discovery-room-001/capture"
os.makedirs(CAP, exist_ok=True)

TITLE = "Does structured receipt exchange improve a bounded computational search task?"

DISCLOSURE_INPUTS = [
    # (nth input/textarea inside .research-disclosure-form .world-offerform, value)
    "Structured receipt exchange improves a bounded computational search task: "
    "condition C (receipt-mediated handoff) beats condition B (plain handoff) on mean MSE.",
    "Whether the receipt mechanism itself causes any improvement; "
    "whether the effect generalizes beyond the frozen search task.",
    "Frozen protocol research/rooms/repro-lab-001/PROTOCOL.md. Conditions A (solo), "
    "B (plain handoff), C (receipt-mediated). Decision rule: C improves on B iff "
    "mean_MSE(C) < mean_MSE(B) - pooled_SE. 10 replications, budget 400.",
    "Run the deterministic receiver-side verification over "
    "research/rooms/repro-lab-001/EVIDENCE-MANIFEST.json and preserve the "
    "recorded outcome, favorable or not.",
    "5000",
    "C1: evidence manifest sha256 c4aa89ffd798948459a5b1e9c2909584ff1d654b136f97b14cb6e5e096116533\n"
    "C2: decision rule applied verbatim: C improves on B iff mean_MSE(C) < mean_MSE(B) - pooled_SE\n"
    "C3: aggregate read from research/rooms/repro-lab-001/results/aggregate.json",
    "The gate-signed result record: verification evidence, the preserved outcome, and the accounting.",
    "A verified-or-refused contribution: the receiver's verdict, the preserved outcome, and the simulated accounting.",
    "The listing owner (researcher, internal operator); the exchange itself is decided by the receiver.",
    "Public on the Exchange board; the disclosure set is readable by any visitor.",
    "The outcome may be cited with its receipt id. A receipt records an agreement; "
    "it does not establish intellectual-property rights or scientific truth.",
]


def shot(page, name):
    page.screenshot(path=os.path.join(CAP, name))
    print("saved", name, flush=True)


def jsclick(page, expr):
    """Click via JS (avoids actionability races with the tour overlay)."""
    page.evaluate(f"({expr})?.click()")


def join(page, name, agent, intent_text):
    page.goto(BASE, wait_until="domcontentloaded")
    # land: watch (film) -> Explore -> dismiss onboarding -> World -> square
    page.wait_for_function(
        "() => document.querySelector('.tour-controls button.ghost')",
        timeout=30000,
    )
    jsclick(page, "document.querySelector('.tour-controls button.ghost')")
    page.wait_for_function(
        "() => document.querySelector('.topbar .controls button')",
        timeout=30000,
    )
    jsclick(
        page,
        "Array.from(document.querySelectorAll('.onboarding button'))"
        ".find(b => /skip/i.test(b.textContent || ''))",
    )
    page.wait_for_timeout(500)
    jsclick(
        page,
        "Array.from(document.querySelectorAll('.topbar .controls button'))"
        ".find(b => (b.textContent || '').trim() === 'World')",
    )
    page.wait_for_selector(".arrival-card", timeout=30000)
    page.wait_for_timeout(1000)
    fields = page.locator(".arrival-field input")
    fields.nth(0).fill(name)
    fields.nth(1).fill(agent)
    page.locator(".intent-btns button", has_text=intent_text).click()
    page.locator(".arrival-card .cg-control-btns .primary").click()
    # the Exchange board lives in the on-demand panels drawer (top-right "Panels")
    page.wait_for_function(
        "() => !document.querySelector('.arrival-card')", timeout=90000
    )
    time.sleep(3)
    jsclick(
        page,
        "Array.from(document.querySelectorAll('button'))"
        ".find(b => (b.textContent || '').trim() === 'Panels')",
    )
    page.wait_for_selector(".panels-drawer", timeout=30000)
    page.wait_for_selector("section[aria-label='Exchange board']", timeout=30000)
    time.sleep(2)


def main():
    with sync_playwright() as pw:
        # Headed Firefox under Xvfb: WebGL2 + native Ed25519 both work, so
        # the real join ceremony runs with the browser's own crypto.
        browser = pw.firefox.launch(headless=False)

        # --- researcher (owner) posts the listing ---
        ra = browser.new_context(viewport={"width": 1280, "height": 900})
        pa = ra.new_page()
        join(pa, "Researcher", "owner console", "Post a need")

        form = pa.locator("section[aria-label='Post a need']")
        form.locator("select").select_option("research-question")
        time.sleep(1)
        disc = form.locator(".research-disclosure-form")
        assert disc.count() == 1, "disclosure expander did not open"
        fields = disc.locator(".world-offerform input, .world-offerform textarea")
        assert fields.count() == 11, f"expected 11 disclosure fields, saw {fields.count()}"
        for i, val in enumerate(DISCLOSURE_INPUTS):
            fields.nth(i).fill(val)
        form_fields = form.locator(".world-offerform > label > input")
        # title is the 2nd top-level input (kind select is first), detail the 3rd
        top_inputs = pa.locator("section[aria-label='Post a need'] > .world-offerform > label > input")
        top_inputs.nth(0).fill(TITLE)
        top_inputs.nth(1).fill(
            "Reproducibility Lab question — the receiver verifies the frozen "
            "evidence and preserves the recorded outcome."
        )
        disc.scroll_into_view_if_needed()
        shot(pa, "post-form-disclosure.png")
        pa.locator("section[aria-label='Post a need'] button.primary").click()
        time.sleep(4)

        # --- board shows the listing with the research badge ---
        board = pa.locator("section[aria-label='Exchange board']")
        board.scroll_into_view_if_needed()
        time.sleep(1)
        shot(pa, "board-listing.png")

        # --- open the listing: full disclosure set ---
        pa.locator(".board-item-main", has_text=TITLE).last.click()
        time.sleep(1)
        pa.locator(".parcel-paper").scroll_into_view_if_needed()
        shot(pa, "listing-disclosure.png")
        pa.locator(".parcel-paper button.primary").click()  # fold it closed
        time.sleep(1)

        # --- contributor (deterministic worker) joins and proposes ---
        rb = browser.new_context(viewport={"width": 1280, "height": 900})
        pb = rb.new_page()
        join(pb, "Contributor", "deterministic worker", "Browse")
        pb.locator(".board-item-main", has_text=TITLE).last.click()
        time.sleep(1)
        pb.locator(".parcel-paper button.primary", has_text="Propose agreement").click()
        time.sleep(4)
        pb.locator(".parcel-paper button.primary", has_text="Fold it closed").click()
        time.sleep(1)

        # --- agreement inspector: proposed state + refusal checks ---
        pb.locator("section[aria-label='Receiving counters'] button.world-linkbtn",
                   has_text="inspect").last.click()
        time.sleep(1)
        insp = pb.locator(".parcel-paper")
        insp.locator("section[aria-label='Refusal checks']").scroll_into_view_if_needed()
        shot(pb, "agreement-proposed.png")

        # real refusal 1: submit before agreement
        pb.locator("section[aria-label='Refusal checks'] button",
                   has_text="Try submitting before agreement").click()
        time.sleep(2)
        shot(pb, "refusal-submit-before-agreement.png")

        # real refusal 2: agree as non-counterpart
        pb.locator("section[aria-label='Refusal checks'] button",
                   has_text="Try agreeing from this session").click()
        time.sleep(2)
        shot(pb, "refusal-agree-non-counterpart.png")

        # --- researcher agrees (counterpart) ---
        # no reload: the drawer's Receiving counters polls; wait for the card
        pa.locator(
            "section[aria-label='Receiving counters'] .ag-card",
            has_text=TITLE[:30],
        ).last.wait_for(timeout=60000)
        pa.evaluate("document.querySelector(\"section[aria-label='Receiving counters']\")?.scrollIntoView()")
        pa.evaluate(
            "Array.from(document.querySelectorAll(\"section[aria-label='Receiving counters'] button.primary\"))"
            ".filter(b => (b.textContent || '').trim() === 'Agree').pop()?.click()"
        )
        time.sleep(4)

        # --- contributor submits: the receiver runs ---
        pb.locator(
            "section[aria-label='Receiving counters'] .ag-card",
            has_text=TITLE[:30],
        ).last.wait_for(timeout=60000)
        pb.evaluate("document.querySelector(\"section[aria-label='Receiving counters']\")?.scrollIntoView()")
        pb.evaluate(
            "Array.from(document.querySelectorAll(\"section[aria-label='Receiving counters'] button.primary\"))"
            ".filter(b => (b.textContent || '').trim() === 'Submit to the receiver').pop()?.click()"
        )
        time.sleep(8)

        # --- agreement inspector: the gate-signed result ---
        # wait for the receiver to settle (result panel renders on poll)
        pb.locator(
            "section[aria-label='Receiving counters'] .ag-card",
            has_text="settled",
        ).last.wait_for(timeout=120000)
        time.sleep(3)
        pb.evaluate(
            "Array.from(document.querySelectorAll(\"section[aria-label='Receiving counters'] button.world-linkbtn\"))"
            ".filter(b => (b.textContent || '').trim() === 'inspect').pop()?.click()"
        )
        time.sleep(2)
        pb.evaluate("document.querySelector(\"section[aria-label='Research agreement record']\")?.scrollIntoView()")
        time.sleep(1)
        shot(pb, "agreement-result.png")

        browser.close()
        print("demo complete", flush=True)


if __name__ == "__main__":
    main()
