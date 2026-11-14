# Ads Features PRD: Every Paid-Ads Feature, Explained Simply

**Product:** Marketing Harness, Ads part only (Meta Ads, Google Ads, GA4, ad pictures, competitor ads)
**Date:** 2026-10-13

## How to read this file

Every feature has a short name, the tool name in `code` (what the computer calls it), and 2 to 4 easy sentences:
**What** it does, **How** you use it, and **Why** we have it.

Think of the ads system like a **careful robot helper that manages your shops' signboards (ads)**.
The robot can look at signboards whenever it wants. But before it changes, buys or turns on anything, it must **ask you first**.

---

## 1. Safety rules (the robot's "ask first" rules)

These rules sit around every other feature. They are the most important part.

**1.1 Three on/off modes** (`mode` in `config/ads-module.yaml`: `off`, `dry-run`, `live-with-approval`)
**What:** A big switch with three positions: "off" (robot does nothing), "pretend" (robot only shows what it *would* do), and "real but ask first". **How:** You set `mode` in the settings file. Today it is set to `dry-run` (pretend). **Why:** So we can practise safely before any real money moves.

**1.2 Ask-first approvals** (`ads.operation.approve`, `ads.operation.reject`, `ads.operation.resume`)
**What:** Every change (new ad, new budget, pause) waits in a line until a human says "yes" or "no". **How:** You press yes or no in the approvals inbox; "yes" approves and sends it in one step. **Why:** A person always stays the boss of the money.

**1.3 Exact-match approval (fingerprint check)**
**What:** When you say "yes", the robot takes a fingerprint (a hash) of the exact change. If even one tiny thing changes after you approved, the robot refuses to send it. **How:** This happens by itself. **Why:** So nobody can sneak a different change in after you said yes.

**1.4 Allowed accounts list** (`accounts` in `ads-module.yaml`)
**What:** A list of the only ad accounts the robot may touch. **How:** You write the account numbers in the settings file; anything not on the list gets refused. **Why:** So the robot can never change the wrong client's ads.

**1.5 Allowed objects list** (`allowedObjects`)
**What:** A second list of special things (Pages, catalogs, businesses) the robot may change. **How:** You add the ID of each Page or catalog you trust. **Why:** Some things live outside the ad account, so we need a separate "yes, this one is OK" list.

**1.6 Verified accounts list** (`verifiedAccounts`)
**What:** A list of accounts that have passed a real, safe test. **How:** An account goes on this list only after a paused test campaign works on it. **Why:** The robot will not launch campaigns on an account that has never been tested.

**1.7 Money ceiling per change** (`maxBudgetPerWrite`)
**What:** The biggest budget or bid the robot may set in one change. **How:** You set a number for each platform; anything bigger is refused. Budgets must be whole positive numbers. **Why:** One typo (like an extra zero) should never become a huge bill.

**1.8 Everything starts paused (robot cannot turn ads on)**
**What:** The robot creates every campaign, ad set and ad **paused**. It is not allowed to switch anything to "ACTIVE". **How:** You check the paused ads, then turn them on yourself inside Ads Manager or Google Ads. **Why:** Ads only spend money when they are on, so a human does the final switch.

**1.9 Special ad categories blocked**
**What:** Ads about housing, jobs, credit, politics and similar "regulated" topics are blocked. **How:** The robot refuses and tells you to do it by hand. **Why:** These ads have strict laws, so a human should handle them.

**1.10 Old or banned options blocked**
**What:** The robot refuses old Meta placements (Instagram Explore feed, Messenger Stories) and old "7-day view" or "28-day view" result windows. **How:** It checks every change before sending. **Why:** Meta removed these, so using them would break or mislead.

**1.11 No secret keys inside requests**
**What:** If a password or access key is pasted inside a request, the robot refuses it. **How:** Keys live only in hidden environment settings (`ADS_DIRECT_*`). **Why:** So secret keys never end up in logs or saved records.

**1.12 No mixing Google customers**
**What:** A Google change may only point to things inside the same customer account. **How:** The robot checks every link inside the change. **Why:** So one client's change can never reach into another client's account.

**1.13 Operation diary** (`ads_list_operations`)
**What:** A diary that writes down every change and where it is: draft, waiting, approved, sent, checked, rejected, failed, half-done, or unsure. **How:** You ask for the list, or see it on the dashboard. **Why:** We always know exactly what happened, even after a crash.

**1.14 Stable change ID (no double changes)** (`operationId`)
**What:** Every real change gets its own name tag. **How:** If something stops halfway, you reuse the same tag to finish it. **Why:** So a retry never creates the same campaign twice.

**1.15 Loud alarm for "unsure" or "half-done"**
**What:** If the robot is not sure a change worked, or only part of it worked, it rings a critical alarm. **How:** You get an alert telling you to check the ad account first. **Why:** Unknown changes with money are dangerous, so a human must look; the robot never retries these alone.

**1.16 Platform version notebook** (`ads_provider_versions`, `meta_ads_capabilities`, `google_ads_capabilities`, `ga4_capabilities`)
**What:** A notebook of which Meta, Google and GA4 version we use, which features are tested, which are old, and when to check again. **How:** You or the robot read it before planning. **Why:** Ad platforms change often; this stops us from using a feature that no longer works.

**1.17 Safe connection to the platforms** (`AdsTransport`)
**What:** The pipe that talks to Meta, Google and GA4. It retries reads when the platform is busy and refreshes Google sign-in keys by itself. **How:** It works in the background. **Why:** Small hiccups should not break reports, and only reads are retried so changes are never sent twice.

---

## 2. Meta Ads (Facebook and Instagram ads)

### 2a. Launching a campaign, step by step

**2.1 Account readiness check** (`meta_ads_readiness`)
**What:** Checks if the Meta account is ready: payment, permissions, Page, pixel (dataset), access level and keys. **How:** Run it with the account number; it gives a list of what is missing and what a human must fix. **Why:** You cannot launch ads on an account that is not set up, so we check first.

**2.2 Campaign plan checker** (`meta_ads_validate_campaign`)
**What:** Reads your campaign plan and checks that the pieces fit: goal, where people land, budget, placements, lead form, app, pixel. **How:** Give it the plan; it says "OK" or lists the mistakes, and saves the plan. It never touches Meta. **Why:** Catching mistakes on paper is free; catching them after launch costs money.

**2.3 Launch preparation and approval card** (`meta_ads_prepare_launch`)
**What:** Turns the checked plan into the exact campaign, ad set, creative and ad Meta will receive, all paused, plus a short summary for the human. **How:** Run it after the checker; read the card and decide. **Why:** The approver sees exactly what will be built before saying yes.

**2.4 Launch on Meta (paused)** (`ads_launch_meta`)
**What:** Builds the whole campaign → ad set → creative → ad on Meta, all paused, then reads each one back to make sure it is really there. **How:** It only runs after the readiness check passed, the account is verified, and a human approved. **Why:** One safe button for a full launch, with proof that it worked.

**2.5 Finish a half-done launch** (`ads_continue_meta_launch`)
**What:** If a launch stopped halfway, this finishes the missing pieces using the parts that already exist. **How:** It needs a new approval; "unsure" launches stay blocked until a human checks. **Why:** So we never build duplicate campaigns when fixing a broken launch.

### 2b. Looking at Meta numbers

**2.6 List ad accounts** (`meta_ads_list_accounts`)
**What:** Shows all Meta ad accounts we can reach. **How:** Run it with no inputs. **Why:** To find the right account number before doing anything.

**2.7 Ad results (insights)** (`meta_ads_insights`)
**What:** Gets numbers like money spent, views, clicks and leads for an account, campaign, ad set or ad, page by page. **How:** Choose the level and dates. **Why:** This is how we know which ads work.

**2.8 Daily watch run** (`meta_ads_run_monitoring`)
**What:** Pulls results for a chosen number of days ending yesterday and saves them. **How:** The scheduled monitoring jobs call it each day (see 6.5). **Why:** So we always have fresh numbers without anyone pressing a button.

**2.9 Targeting search** (`meta_ads_search_targeting`)
**What:** Finds interests, places and categories you can target, like "yoga" or "Mumbai". **How:** Type a word; it returns the matching Meta options. **Why:** Targeting must use Meta's exact option IDs, so this finds them.

**2.10 Budget schedules** (`meta_ads_list_budget_schedules`, `meta_ads_create_budget_schedule`)
**What:** Reads or creates planned budget boosts for set times (like a sale weekend). **How:** Only for daily-budget campaigns, and creating one needs approval. **Why:** Spend more on busy days automatically. Marked "not yet tested" until a real account test passes.

### 2c. Managing Meta things (create, read, change, delete)

Each item below has five tools: `list`, `get`, `create`, `update`, `delete` (for example `meta_ads_create_campaign`). Reading is free; create, update and delete need approval.

**2.11 Campaigns** (`meta_ads_*_campaign`)
**What:** The big box that holds the goal of your ads, like "get leads" or "get sales". **How:** Create, read, change or delete campaigns; new ones start paused. **Why:** Every Meta ad must live inside a campaign.

**2.12 Ad sets** (`meta_ads_*_adset`)
**What:** The middle box: who sees the ad, where, and the budget. **How:** Create or change targeting, goals and budget. **Why:** This decides who sees your ads and how money is spent.

**2.13 Ads** (`meta_ads_*_ad`)
**What:** The actual ad people see, joined to a creative. **How:** Create, read, pause or delete ads. **Why:** This is the ad itself, the thing people click.

**2.14 Creatives** (`meta_ads_list/get/create/delete_creative`)
**What:** The picture or video plus words of an ad. **How:** Create or read them; they cannot be edited after creation (Meta's rule), so you make a new one instead. **Why:** Ads need a creative to show anything.

**2.15 Custom audiences** (`meta_ads_*_audience`)
**What:** Groups of people, like "people who visited our website" or "our customers". **How:** Create, read, change or delete audiences. **Why:** Showing ads to warm people usually costs less and works better.

**2.16 Ad labels** (`meta_ads_*_label`)
**What:** Name stickers you put on ads, like "summer-sale". **How:** Create and attach labels. **Why:** Makes it easy to find and group ads later.

**2.17 Product catalogs** (`meta_ads_*_catalog`)
**What:** A shop list of all your products for shopping ads. **How:** Create or manage catalogs under the business. **Why:** Needed for ads that show your products automatically.

**2.18 Product sets** (`meta_ads_*_product_set`)
**What:** A smaller group inside the catalog, like "only shoes". **How:** Create with a filter rule. **Why:** So one ad shows only the right products.

**2.19 Product feeds** (`meta_ads_*_product_feed`)
**What:** The file that keeps the catalog up to date (prices, stock). **How:** Create and manage feeds on a catalog. **Why:** Ads must show the right price and stock.

**2.20 Lead forms** (`meta_ads_list/get/create/delete_lead_form`)
**What:** A small form inside Facebook or Instagram where people leave their name and number. **How:** Create with questions and a privacy policy; they cannot be edited after (Meta's rule). **Why:** Getting leads without leaving the app is easier for people.

### 2d. Meta read-only lists

**2.21 Read leads and test leads** (`meta_ads_list_leads`, `meta_ads_list_test_leads`)
**What:** Shows people who filled your lead forms, and practice leads. **How:** Point it at a form. **Why:** So we can follow up with real leads quickly.

**2.22 Read products and feed uploads** (`meta_ads_list_products`, `meta_ads_list_feed_uploads`)
**What:** Shows products in a catalog and the history of feed uploads. **How:** Point it at a catalog or feed. **Why:** To check products and spot failed uploads.

**2.23 Read pixels, Pages, business users and Instagram accounts** (`meta_ads_list_pixels`, `meta_ads_list_pages`, `meta_ads_list_business_users`, `meta_ads_list_instagram_accounts`)
**What:** Shows the tracking pixels, Facebook Pages, team members and Instagram accounts linked to the business. **How:** Run with the account, business or Page ID. **Why:** We need these IDs to set up and check ads.

### 2e. Meta special actions (all need approval)

**2.24 Upload image** (`meta_ads_upload_image`)
**What:** Sends a picture to the ad account's image library. **How:** Give the image data. **Why:** Creatives need an uploaded image first.

**2.25 Upload video** (`meta_ads_upload_video`)
**What:** Sends a video from a web link to the ad account. **How:** Give the video URL and a title. **Why:** Video ads need an uploaded video first.

**2.26 Add people to an audience** (`meta_ads_audience_add_users`)
**What:** Adds customers (scrambled for privacy) to a custom audience. **How:** Give the audience ID and the list. **Why:** Lets us show ads to past customers or leave them out.

**2.27 Send conversion events** (`meta_ads_send_conversion_events`)
**What:** Tells Meta directly from our server when someone bought or signed up (the Conversions API). **How:** Send events to the pixel; you can use a test code first. **Why:** Browsers block some tracking, so this makes results more accurate.

**2.28 Create a test lead** (`meta_ads_create_test_lead`)
**What:** Makes a pretend lead on a lead form. **How:** Point it at the form. **Why:** To check that leads reach us before real money is spent.

**2.29 Upload a product feed** (`meta_ads_upload_feed`)
**What:** Tells Meta to pull a fresh product file from a link. **How:** Give the feed ID and the file URL. **Why:** Keeps prices and stock up to date in shopping ads.

---

## 3. Meta's own ad helper (Meta Ads MCP, 91 tools)

**3.0 How the whole group works**
**What:** Meta runs its own robot helper with 91 ad tools. Our system passes requests to it, but through all our safety rules first. **How:** It is off until you set `ADS_META_MCP=on`; every tool name starts with `meta_mcp_`. **Why:** We get all of Meta's newest tools without building each one ourselves, and still stay safe.

**3.0a Extra safety for Meta's helper**
**What:** (1) A tool must be sorted into "read" or "change" before it can be used. (2) "Turn on an ad" (`ads_activate_entity`) is always blocked. (3) Customer emails and phone numbers must be scrambled (SHA-256) first. (4) All "change" tools stay refused until the live tool list is fetched. **How:** This happens by itself. **Why:** Meta's tools are powerful, so we only open them one careful step at a time.

**3.0b Tool list refresher** (`bin/meta-mcp-snapshot.js`)
**What:** Fetches the latest list of Meta's tools and saves it. **How:** Run the script; a test fails if any tool is not sorted. **Why:** When Meta adds or changes tools, we notice straight away.

**3.1 Reporting and smart insights** (`ads_get_ad_entities`, `ads_get_opportunity_score`, `ads_insights_advertiser_context`, `ads_insights_anomaly_signal`, `ads_insights_auction_ranking_benchmarks`, `ads_insights_industry_benchmark`, `ads_insights_performance_trend`)
**What:** Gets results, a 0–100 account health score with tips, strange-change warnings, comparisons with similar businesses, and trends over time. **How:** Read-only; ask with an account. **Why:** Meta's own advice helps us find what to fix first.

**3.2 Accounts and Pages** (`ads_get_ad_accounts`, `ads_get_ad_account_pages`, `ads_get_pages_for_business`, `ads_get_user_pages`, `ads_get_field_context`)
**What:** Lists ad accounts, Pages, and what each report field means. **How:** Read-only. **Why:** To find the right IDs and ask for reports correctly.

**3.3 Building ads** (`ads_create_campaign`, `ads_create_ad_set`, `ads_create_ad`, `ads_update_entity`, `ads_create_creative`)
**What:** Creates campaigns, ad sets, ads and creatives (all paused), and edits them. **How:** Needs approval and an allowed account. **Why:** Another way to build ads using Meta's own tools.

**3.4 Looking at creatives** (`ads_get_creatives`, `ads_get_creative_ads`, `ads_get_ad_images`, `ads_get_ad_videos`, `ads_get_ad_preview`)
**What:** Shows creatives, which ads use them, images, videos and a preview of how the ad looks. **How:** Read-only. **Why:** To see the ad the way customers will.

**3.5 Ad Library search** (`ads_library_search`)
**What:** Searches Meta's public library of ads other companies run. **How:** Read-only; search by name or word. **Why:** To learn from competitors' ads.

**3.6 Instagram** (`ads_get_ig_accounts`, `ads_get_ig_media`, `ads_boost_ig_post`)
**What:** Lists Instagram accounts and turns an existing Instagram post into a paid ad (boost). **How:** Boosting needs approval. **Why:** A post that already does well can become an ad quickly.

**3.7 Custom audiences** (`ads_get_ad_account_custom_audiences`, `ads_get_custom_audience`, `ads_get_custom_audience_adsets`, `ads_create_custom_audience`, `ads_update_custom_audience`, `ads_update_custom_audience_users`, `ads_delete_custom_audience`)
**What:** Reads, makes, changes and deletes audiences and their people. **How:** Changes need approval; people's data must be scrambled. **Why:** Reach the right people while keeping their data private.

**3.8 Catalogs, products, feeds and rules** (28 tools starting `ads_catalog_`)
**What:** Full control of shop catalogs: create catalogs, products, product sets, feeds, upload sessions, feed rules, and health checks for dynamic ads. **How:** Reads are free, changes need approval. **Why:** Shopping ads only work when the catalog is clean and healthy.

**3.9 Catalog event sources** (`ads_catalog_event_source_get`, `..._get_catalogs`, `..._get_health`, `..._get_recommendations`, `..._connect`, `..._disconnect`)
**What:** Connects the pixel to the catalog and checks how well they match. **How:** Connect and disconnect need approval. **Why:** Dynamic ads need to know which products people looked at.

**3.10 Pixels and datasets** (`ads_get_datasets`, `ads_get_dataset_details`, `ads_get_dataset_stats`, `ads_get_dataset_quality`, `ads_pixel_event_*`, `ads_pixel_parameter_*`, `ads_get_customconversions`)
**What:** Checks tracking data quality and manages pixel events and their details. **How:** Reads are free, changes need approval. **Why:** Bad tracking means bad decisions, so we check it.

**3.11 Help and errors** (`ads_get_errors`, `ads_get_help_article`)
**What:** Shows account errors and Meta help pages. **How:** Read-only. **Why:** To fix problems faster.

**3.12 Experiments** (`ads_experiment_list_tests`, `ads_experiment_check_eligibility`, `ads_experiment_abtest_create_test`, `ads_experiment_abtest_get_test`, `ads_experiment_abtest_update_test`, `ads_experiment_lift_create_test`, `ads_experiment_lift_get_test`)
**What:** Runs A/B tests (which ad wins) and lift tests (did ads really cause sales). **How:** Creating or changing tests needs approval. **Why:** Tests give real answers instead of guesses.

**3.13 Activity log** (`ads_account_get_activity_logs`)
**What:** Shows who changed what in the account and when. **How:** Read-only. **Why:** To find out why something changed.

---

## 4. Google Ads

### 4a. Launching safely

**4.1 Account readiness check** (`google_ads_readiness`)
**What:** Checks access, billing, tracking, conversions, policies, landing pages and Merchant Center. **How:** Run with the customer ID; it lists what is missing. **Why:** Google ads fail or waste money if setup is incomplete.

**4.2 Search campaign plan checker** (`google_ads_validate_search_campaign`)
**What:** Checks a Search campaign plan: dates, budget, ad groups, keywords and ads. For example, broad keywords must use smart bidding, not "maximize clicks". **How:** Give it the plan; it lists mistakes and saves it. **Why:** Find mistakes before Google charges anything.

**4.3 Other campaign types gate** (`google_ads_validate_campaign_type`)
**What:** Checks other types (like Performance Max, Shopping, App, Video) have what they need: pictures, product feed, values, app events. **How:** Run before planning a non-Search campaign. **Why:** These types fail without the right parts, so we add them one at a time, in order.

**4.4 Search launch steps** (`google_ads_prepare_search_launch`)
**What:** Makes the step-by-step list: budget, campaign, ad groups, keywords, ads, all paused and "test only" first. **How:** Only works after a Meta paused launch has been proven. **Why:** We prove the safe process on Meta first, then copy it to Google.

**4.5 Google test run** (`google_ads_validate_operations`)
**What:** Asks Google "would this change work?" without really doing it (validateOnly). **How:** Must pass before a human can approve a Google change. **Why:** Google tells us about errors for free before anything is real.

**4.6 Check a slow job** (`google_ads_verify_operation`)
**What:** Checks on a Google job that takes time to finish, without sending it again. **How:** Give the change ID. **Why:** "Accepted" is not "done", so we check until it really finishes.

### 4b. Reading Google numbers

**4.7 List accounts** (`google_ads_list_accounts`)
**What:** Shows all Google Ads customers we can reach. **How:** Run with no inputs. **Why:** To find the right customer ID.

**4.8 Google search reports** (`google_ads_search`)
**What:** Asks Google Ads for any data using its query language (GAQL) and collects every page of results. **How:** Give the account and the query. **Why:** This is how all Google reports get their numbers.

**4.9 Ready-made report recipes** (`google_ads_report_templates`)
**What:** 13 ready reports: account, campaign, ad group, ad, asset, keyword, search terms, budget pacing, quality score and impression share, policy and learning, conversion actions, change history, experiments. **How:** Pick one and run it with `google_ads_search`. **Why:** Nobody has to write a query from scratch.

### 4c. Changing Google things (all need approval)

**4.10 Change 30 kinds of Google things** (`google_ads_mutate_<thing>`)
**What:** Create, update or remove campaigns, budgets, ad groups, ads, keywords, negative keyword lists, bid strategies, assets, asset groups, audiences, labels, conversion actions, conversion value rules, experiments and more. **How:** Send typed changes; updates must say which fields change; partial failures stay visible. **Why:** Covers almost everything you can do in Google Ads, with the same safety rules.

**4.11 Keyword ideas, history and forecast** (`google_ads_keyword_ideas`, `google_ads_keyword_historical_metrics`, `google_ads_keyword_forecast`)
**What:** Suggests keywords, shows how often people searched them, and guesses clicks and costs. **How:** Read-only; give seed words or a website. **Why:** Picking good keywords is the heart of Search ads.

**4.12 Upload offline sales** (`google_ads_upload_click_conversions`, `google_ads_upload_conversion_adjustments`)
**What:** Tells Google which clicks later became real sales or leads, and fixes values afterwards (like refunds). **How:** Send the click IDs and values. **Why:** Google bids smarter when it knows what really made money.

**4.13 Customer Match lists** (`google_ads_create_customer_match_job`, `google_ads_add_customer_match_operations`, `google_ads_run_customer_match_job`)
**What:** Uploads a customer list to Google in three steps: make the job, add people, run it. **How:** Each step needs approval. **Why:** Show ads to past customers, or keep them out of new-customer ads.

**4.14 Google experiments** (`google_ads_schedule_experiment`, `google_ads_promote_experiment`, `google_ads_end_experiment`, `google_ads_graduate_experiment`)
**What:** Starts, ends, and applies the winner of a campaign experiment. **How:** Each step needs approval; Google finishes it later. **Why:** Test a change on half the traffic before using it everywhere.

---

## 5. GA4 (Google Analytics, the website scoreboard)

**5.1 GA4 readiness check** (`ga4_readiness`)
**What:** Checks the property, data streams, tag, events, links, consent, cross-domain and campaign tags. **How:** Run with the property ID; it lists what is missing. **Why:** If GA4 is broken, every ad report is wrong.

**5.2 Tracking audit** (`ga4_tracking_audit`)
**What:** Looks at tracking problems and data quality, and lowers how sure the robot is when data looks bad. **How:** Give it the evidence you have. **Why:** We should not trust advice built on broken data.

**5.3 Report checker** (`ga4_validate_report`)
**What:** Checks a report plan is correct (for example, realtime reports cannot have dates) and saves it. **How:** Give it the report plan. **Why:** Stops broken reports before they run.

**5.4 Checked report runner** (`ga4_run_validated_report`)
**What:** Checks the report, asks GA4 if the fields can be used together, runs it, and saves quality notes. **How:** Give the report plan; used by schedules too. **Why:** Reliable numbers, every time.

**5.5 Ready-made GA4 recipes** (`ga4_report_templates`)
**What:** 11 ready reports: landing pages, source/medium, channels, campaigns, events, shop revenue, lead funnel, user acquisition, traffic acquisition, device and country, realtime health. **How:** Pick one and run it. **Why:** The most-used reports are ready in one click.

**5.6 Raw GA4 reports** (`ga4_runReport`, `ga4_runPivotReport`, `ga4_runRealtimeReport`, `ga4_runFunnelReport`, `ga4_checkCompatibility`, `ga4_metadata`)
**What:** Direct access to GA4's normal, pivot (table), live and funnel reports, plus the list of fields. **How:** Funnel reports use a test version of Google's API, so they stay off unless you switch them on (`enableGA4Alpha`). **Why:** For custom questions the recipes do not cover.

**5.7 GA4 change proposal (draft only)** (`ga4_create_admin_proposal`)
**What:** Writes down a GA4 settings change as a draft and does not send it. **How:** Give the change and the reason; a human reviews it. **Why:** GA4 settings affect all reports, so we plan carefully first.

**5.8 GA4 admin things** (`ga4_list/create/update/delete_<thing>`)
**What:** Manages audiences, channel groups, data streams, key events (conversions), notes on reports, and links to Google Ads, BigQuery, Display & Video 360, Search Ads 360 and Firebase. **How:** Listing is free; changes need approval. **Why:** Correct key events and links make ad results show up properly.

**5.9 GA4 settings** (`ga4_get_attributionSettings`, `ga4_get/update_dataRetentionSettings`, `ga4_get/update_enhancedMeasurementSettings`)
**What:** Reads how GA4 gives credit for sales, how long it keeps data, and automatic tracking like scrolls and clicks. **How:** Reading is free; changes need approval. Attribution can only be read. **Why:** These settings change what the numbers mean.

---

## 6. Measuring, thinking and advising

**6.1 Three separate scoreboards** (`ads_reconcile_measurement`)
**What:** Keeps three views apart: what the ad platforms say, what GA4 says, and real business results with duplicates removed. **How:** Give spend, GA4 data and real sales or leads for the same dates and currency. **Why:** Meta and Google both claim the same sale, so adding them up would lie.

**6.2 Fair channel comparison** (`ads_compare_performance`)
**What:** Compares Meta and Google: return on ad spend, cost per good lead, cost per new customer, and one honest total return (ROAS) with each order counted once. **How:** Give one row per platform and your order list, all in one currency. **Why:** To decide fairly where the next rupee should go.

**6.3 Tired-ad check** (`ads_analyze_creative`)
**What:** Compares an ad's last period with an earlier one. If clicks dropped and cost per result rose by more than 20%, it says "review this ad". **How:** Give both periods; with too little data it says "wait". It never pauses by itself. **Why:** People get bored of seeing the same ad, and we want to spot that early.

**6.4 Advice cards (recommendations)** (`ads_create_recommendation`)
**What:** Saves a suggestion with its proof, like "move budget from ad A to ad B". **How:** The robot or a person creates it; a human decides. It is never done automatically. **Why:** Ideas are written down with evidence, but people stay in charge.

**6.5 Watch schedule** (`ads_schedule_monitoring`)
**What:** Sets up a first look back over 90 days, then a read-only check every day at 8:00 in the account's time zone. **How:** Choose the platform, account, time zone and currency. **Why:** We always know the normal level, so changes stand out.

**6.6 Saved records list** (`ads_list_records`)
**What:** Lists everything saved: readiness checks, campaign plans, launches, tests, audits, reports, advice, schedules and change proposals. **How:** Pick what kind you want to see. **Why:** One place to find past work.

**6.7 Make exact campaign changes (skill)** (`skill_campaign_optimization`)
**What:** Takes a clear list of changes and runs each one through the same safety gate. **How:** Give it the list of changes. **Why:** Even batch changes must follow every safety rule.

**6.8 GA4 funnel check (skill)** (`skill_ga4_analysis`)
**What:** Looks at how people move through the website, and where phone or computer users drop off. **How:** Run it on GA4 data. **Why:** Sometimes the ad is fine but the website is the problem. It is careful not to claim more than the data shows.

**6.9 Boss report (skill)** (`skill_performance_reporting`, also called `skill_campaign_analysis`)
**What:** Makes a short leadership report: money, results, channels and "what did we learn?". **How:** Run it on demand or from a mission. **Why:** Bosses need a short, honest summary, not raw tables.

---

## 7. Automatic jobs (the robot's daily alarm clock)

**7.1 Daily numbers snapshot** (`kpi-snapshot` job)
**What:** Every day it saves yesterday's spend, views, clicks and leads from Meta and Google, plus cost per lead. **How:** Runs by itself for the allowed accounts; warns if one fails and raises a big alarm if all fail. **Why:** So charts and reports always have fresh numbers.

**7.2 Weekly and monthly reports** (`report-weekly`, `report-monthly` jobs)
**What:** Writes a short report: spend, leads, cost per lead, and change against the last period. **How:** Weekly report every week; monthly on the 1st. **Why:** Clients get regular updates without anyone writing them.

**7.3 Weekly tired-ad check** (`ads-fatigue-weekly` job)
**What:** Each week it compares the last 7 days with the 7 before for every Meta ad. Tired ads get a "pause?" card in the approvals inbox. **How:** Runs by itself; you only press yes or no. **Why:** Stops money going to ads people have stopped caring about. Nothing pauses without a yes.

**7.4 Daily health check for ad keys** (`doctor-daily` job)
**What:** Checks every morning that the Meta, Google and GA4 keys exist and still work. **How:** Runs by itself; raises an alarm if a key is broken. **Why:** A broken key means silent missing data, so we catch it early.

**7.5 Alerts**
**What:** Sends warnings at three levels (info, warn, critical) for tired ads, failed snapshots, broken keys and unsure changes. **How:** Happens by itself. **Why:** People find out about problems fast.

---

## 8. Making ad pictures (Creative)

**8.1 Meta picture sizes** (`META_FORMATS`)
**What:** Knows the exact sizes: feed portrait 1080×1350 (made first), square 1080×1080, story/reel 1080×1920, carousel card 1080×1080. **How:** Every picture gets cropped to one of these. **Why:** The wrong size gets cut off or looks blurry.

**8.2 Safe zones and word limits** (`SAFE_ZONE`, `LIMITS`)
**What:** Keeps words out of the top 14% and bottom 35% of stories and reels, where Instagram buttons sit. It also limits picture text (25 letters, 3 phrases), headline (40) and main text (125). **How:** Used automatically when making pictures. **Why:** So words are never hidden and ads are short enough to read.

**8.3 Brand-safe picture instructions** (`buildPrompt`)
**What:** Builds the instruction for the picture robot from a scene plan plus your brand colours, mood and texture. It tells it "no words, no logos" and removes junk words like "8k" or "masterpiece". **How:** Fill `brand.visual` in `config/business.yaml`. **Why:** Pictures stay on-brand, and junk words make pictures worse.

**8.4 Picture and text robot** (`generateImage`, `chatJson` via OpenRouter)
**What:** Asks an AI model (through OpenRouter) to draw the background picture, and to write ad plans in a fixed format. It retries when busy, stops on bad key or no credits, and records the cost. **How:** Needs `OPENROUTER_API_KEY` and model names in settings. **Why:** Lots of ad pictures fast, and we can swap models without changing code.

**8.5 Words-on-picture maker** (`compose`)
**What:** Crops the picture to the exact size and puts your headline, phrases, brand name and card number on top, with a soft shade so words are easy to read. **How:** Runs after the picture is made; it checks the final size is exactly right. **Why:** AI pictures often spell words wrong, so we add the words ourselves and spelling is always correct.

**8.6 One-picture trial** (`bin/creative-mvp.js`)
**What:** Makes one real paid ad picture from start to finish as a test. **How:** Run `node --env-file=.env bin/creative-mvp.js`; the picture goes into `runs/creative/mvp/`. **Why:** Proves the full picture pipeline works before building the bigger version (still waiting for approval).

---

## 9. Spying on competitor ads

**9.1 Competitor ad decode** (Decode, platform `meta_ads`)
**What:** Collects competitors' live ads from Meta's Ad Library (through Apify), sorts them by type, and draws a chart of "days running" against "number of versions". **How:** Start a Decode run for a niche or brand. **Why:** An ad that runs a long time with many versions is probably making money, so it is worth learning from.

**9.2 Our own ads decode** (Decode, platform `own_meta`)
**What:** Does the same sorting and chart for our own Meta ads, using our real spend and results. **How:** Start a Decode run on our ad account. **Why:** To see which of our own ad styles work best.

**9.3 Competitor ad research** (`research_competitor_ad_library`, market research skill)
**What:** Looks at competitor ad messages on Meta Ad Library and Google Ads Transparency Center, finds gaps, and suggests different angles. **How:** Give a competitor's website. **Why:** So our ads say something new instead of copying everyone else.

---

## 10. Ways to use it (screens, commands and plumbing)

**10.1 Approvals inbox** (`/api/console/approvals`)
**What:** A simple list of waiting ad changes in plain words, like "Pause this ad?" or "Launch a new Meta campaign (created paused)". **How:** Press yes or no; "yes" approves and sends in one go. **Why:** Clients can approve without knowing ad jargon.

**10.2 Ads dashboard** (`/api/ads/dashboard`)
**What:** One view of ads health, all tools, saved records, and all changes still open (waiting, failed, half-done, unsure). **How:** Open it on the dashboard. **Why:** See everything important at a glance.

**10.3 Ads web buttons (API)** (`/api/meta/...`, `/api/google-ads/...`, `/api/ga4/...`, `/api/measurement/reconciliation`, `/api/ads/analysis`, `/api/ads/recommendations`, `/api/ads/operations/:id/approve|reject|resume`)
**What:** Web addresses the dashboard uses to check readiness, check plans, launch, run reports, audit, compare and approve. **How:** The dashboard calls them; developers can call them too. **Why:** Every feature can be used from a screen, not just a terminal.

**10.4 Ask in plain words (DeepSeek ads command)** (`pnpm ask`)
**What:** You type what you want ("start a lead campaign in Pune for ₹500 a day"). The AI picks the tool, checks it, asks only for missing or risky details, and shows an approval card. **How:** Type the request; approve the card. **Why:** You do not need to know tool names. It never reports half-done work as done.

**10.5 Ads tools for other AI agents (MCP server)** (`marketing-mcp ads [meta|google|ga4]`)
**What:** Opens all ads tools to other AI apps (like Claude), optionally only one platform. **How:** Run the command and connect it in the AI app. **Why:** Any AI helper can use our ads tools with the same safety rules.

**10.6 Ads department command line** (`marketing-department ads ...`)
**What:** Lists what the ads department can do and runs a task from a file. **How:** Run in the terminal. **Why:** Quick testing and scripts without the dashboard.

**10.7 Live activity feed** (`ADS_OPERATION_CHANGED` event)
**What:** Each time an ad change moves (waiting → sent → checked), a live event goes to the dashboard's office view. **How:** Happens by itself. **Why:** You can watch the robot work in real time.

**10.8 Weekly ops summary**
**What:** One short line with 7-day spend and leads (and % change), and how many approvals are waiting and for how long. **How:** Part of the operations digest. **Why:** A quick health check of the ads business.

**10.9 Settings files** (`config/ads-module.yaml`, `config/ads.yaml`)
**What:** `ads-module.yaml` holds mode, allowed accounts, verified accounts, allowed objects and money ceilings. `ads.yaml` turns each platform `off`, `direct` or `dry-run`. **How:** Edit the files; secret keys go only in `ADS_DIRECT_*` environment settings. **Why:** Change behaviour without changing code, and keep secrets out of files.

**10.10 Google sign-in helper** (`oauth-loopback`)
**What:** A tiny local page that catches Google's "you are signed in" reply. **How:** Open the printed link, sign in, and the helper saves the code. Works on servers with no browser too. **Why:** Google Ads and GA4 need a sign-in before we can read data.

**10.11 Ads memory boxes** (`control.sqlite`, `operations.sqlite`)
**What:** Two small databases: one for versions, plans and records, one for the change diary. **How:** Saved by themselves, with private folder permissions. **Why:** Nothing is lost when the app restarts, and half-done work can be finished.

---

## Current status (honest notes)

- **Mode is `dry-run`** (pretend). One Meta account is allowed; no accounts are verified yet, so real launches are still blocked.
- **Meta's own helper (section 3)** is off by default. Its "change" tools stay refused until the live tool list is fetched.
- **Google launches** wait until a Meta paused launch has been proven on a real account.
- **Budget schedules** and most Meta goal types are marked "not yet tested" until a real paused-account test.
- **Ad pictures (section 8)**: only the one-picture trial is built; the full pipeline is waiting for approval.
- **Competitor decode (section 9)** has not run yet against real Apify data (needs a token).
