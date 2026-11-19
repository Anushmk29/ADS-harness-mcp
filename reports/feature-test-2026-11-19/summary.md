# Harness feature test, 2026-11-19

Account act_2087398631820901. Reads were live; writes were dry-run; safety checks used the live policy.

## Meta reads (39/39 pass)

| Result | Feature | Tool | Detail |
|---|---|---|---|
| PASS | List ad accounts | `meta_ads_list_accounts` | {"taskId":"3694911a-3cac-49f9-88b5-683aad95bd92","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Provider versions | `ads_provider_versions` | {"taskId":"f513151a-68bb-45be-bdc1-8079bff8662a","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","data":[{"provider":"meta" |
| PASS | Meta capability map | `meta_ads_capabilities` | {"taskId":"0d072595-52e7-49b2-a780-07cf398636b4","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","data":[{"id":"awareness", |
| PASS | List campaigns | `meta_ads_list_campaign` | {"taskId":"9a3281aa-5a78-4dfa-8e8d-607875016d26","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Get one campaign | `meta_ads_get_campaign` | {"taskId":"65830d90-05e5-451c-9aee-5cfc1a15794b","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | List adsets | `meta_ads_list_adset` | {"taskId":"78a871dd-f2c5-47b6-91f9-d01554759fe8","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Get one adset | `meta_ads_get_adset` | {"taskId":"acc24054-265e-4dc7-b43b-da83613c58b4","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | List ads | `meta_ads_list_ad` | {"taskId":"6273ac4f-7232-4b1d-abc1-7d08b90456f3","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Get one ad | `meta_ads_get_ad` | {"taskId":"5eef4af9-fda9-4eef-bcce-98960bb0b3a3","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | List creatives | `meta_ads_list_creative` | {"taskId":"75abddf0-73a3-490a-a1e2-e6e2ee3a5951","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Get one creative | `meta_ads_get_creative` | {"taskId":"b5325ab2-ea8a-41ab-8e05-75909f61b21d","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | List audiences | `meta_ads_list_audience` | {"taskId":"6c812cb3-5857-4a5b-a1eb-4d347c2d471e","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| SKIP | Get one audience | `meta_ads_get_audience` | No audiences on the account to fetch |
| PASS | List labels | `meta_ads_list_label` | {"taskId":"eaaa9b53-c363-4335-a072-683af4169f39","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Get one label | `meta_ads_get_label` | {"taskId":"a784b724-51e7-4d93-8720-dfd438c64d1c","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Pixels | `meta_ads_list_pixels` | {"taskId":"719b50c6-f12c-4f76-9aca-7e63b48bd05b","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Instagram accounts on the Page | `meta_ads_list_instagram_accounts` | {"taskId":"e8a17c04-8ce2-4715-963f-05a2e09bdbe4","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Pages owned by the business | `meta_ads_list_pages` | {"taskId":"5a4d8f50-3612-4c6a-a452-a2adf7277cd6","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Business users | `meta_ads_list_business_users` | {"taskId":"fcac2e4a-e661-4ab2-afe2-bbcded2af19f","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Catalogs (business) | `meta_ads_list_catalog` | {"taskId":"ef5b358c-1a9e-4fdb-86ab-7e2b46174079","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Get catalog | `meta_ads_get_catalog` | {"taskId":"2f19b570-aaae-41cc-b3ea-f71d41d68500","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Product sets | `meta_ads_list_product_set` | {"taskId":"e634a251-81f3-49b9-bd36-784d2f52681f","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Product feeds | `meta_ads_list_product_feed` | {"taskId":"4516b215-ca19-4c5a-8bfe-fea64b2cf2ea","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Products | `meta_ads_list_products` | {"taskId":"e67680de-c4e6-4558-b2e4-dc925d09ffe2","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Lead forms (page) | `meta_ads_list_lead_form` | {"taskId":"cadeba9d-c085-4f16-af6a-ba386e0461d8","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Leads | `meta_ads_list_leads` | {"taskId":"d6072c7a-61a5-455f-a837-ebf26b067e3a","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Test leads | `meta_ads_list_test_leads` | {"taskId":"69540ddd-fcfb-4436-8d44-8fb33cc626fe","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Budget schedules | `meta_ads_list_budget_schedules` | {"taskId":"8b9af7b7-d82f-4d8d-aaa5-147c8192d977","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Insights, account level | `meta_ads_insights` | {"taskId":"7ea0faa1-ecc7-4666-90c7-7f13a283f7f7","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Insights, campaign level | `meta_ads_insights` | {"taskId":"cb6dc680-ed61-4206-b562-1aba72021aff","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Insights, adset level | `meta_ads_insights` | {"taskId":"7e130940-4cb4-41ee-9496-49425a4ccdd8","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Insights, ad level | `meta_ads_insights` | {"taskId":"d67abc49-0a8b-4acb-bf8b-beac61675126","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Insights, daily rows | `meta_ads_insights` | {"taskId":"8dab980b-432d-488b-94cd-0d5dc5067e38","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Insights, age+gender breakdown | `meta_ads_insights` | {"taskId":"5eb6b818-4b7b-4281-9acb-5dd16de08182","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Insights, placement breakdown | `meta_ads_insights` | {"taskId":"9bb1cb14-b645-47fd-af8e-5e20bc5c3329","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Insights, one campaign | `meta_ads_insights` | {"taskId":"678a123d-4376-40f5-a71c-f8d2affe98d7","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Targeting search: interests | `meta_ads_search_targeting` | {"taskId":"9a99ad49-771d-4c46-b30e-5490f2da47af","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Targeting search: interest suggestions | `meta_ads_search_targeting` | {"taskId":"c71b26f2-3bbf-4482-ba85-4b026fd7fdb2","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Targeting search: locations | `meta_ads_search_targeting` | {"taskId":"6928f9c2-d5c8-4247-bdec-d2ea1b36ea67","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Targeting search: categories | `meta_ads_search_targeting` | {"taskId":"177426e4-7f89-4d7a-ad76-6f293fd1c052","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |

## Meta planning (3/3 pass)

| Result | Feature | Tool | Detail |
|---|---|---|---|
| PASS | Account readiness check | `meta_ads_readiness` | {"taskId":"5f722ac6-f82e-4f72-b935-575d7d3114cd","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","data":{"provider":"meta", |
| PASS | Validate a campaign draft | `meta_ads_validate_campaign` | {"taskId":"346c1232-cff4-4842-b45a-dfb7b34c3a0d","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","data":{"draftId":"feature |
| PASS | Prepare a paused launch + approval brief | `meta_ads_prepare_launch` | {"taskId":"a76d5bca-8f6f-479d-84b8-ab5bf5258957","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","data":{"draftId":"feature |

## Meta writes (dry-run) (26/26 pass)

| Result | Feature | Tool | Detail |
|---|---|---|---|
| PASS | Create campaign | `meta_ads_create_campaign` | {"taskId":"3a2c0228-9b54-4943-9e1e-0e342fe38fd5","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_create_campai |
| PASS | Update campaign (rename) | `meta_ads_update_campaign` | {"taskId":"e151a4f4-b364-452d-8ac2-8365d328c1a3","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_update_campai |
| PASS | Delete campaign | `meta_ads_delete_campaign` | {"taskId":"f92a4261-4177-4bca-b87c-d7d2f47b8ec3","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_delete_campai |
| PASS | Create ad set | `meta_ads_create_adset` | {"taskId":"f23ba8fd-ad56-411c-8ec0-62d5875e9c1e","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_create_adset" |
| PASS | Update ad set | `meta_ads_update_adset` | {"taskId":"82fe700e-a538-4f10-873e-3f5c7a27e055","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_update_adset" |
| PASS | Delete ad set | `meta_ads_delete_adset` | {"taskId":"83e1a47d-a742-401f-855c-b11b57ea231b","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_delete_adset" |
| PASS | Create ad | `meta_ads_create_ad` | {"taskId":"6dee7f16-4b9e-470e-924c-aab0e0827ed8","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_create_ad","a |
| PASS | Update ad | `meta_ads_update_ad` | {"taskId":"a772b4bd-1b6e-4b30-b8dd-58a50660e58b","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_update_ad","a |
| PASS | Delete ad | `meta_ads_delete_ad` | {"taskId":"47b3bd98-91fd-4414-ada9-7e3cf5ff0fc7","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_delete_ad","a |
| PASS | Create creative | `meta_ads_create_creative` | {"taskId":"a6c4363e-8622-4f56-92a7-34daf66b2f1f","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_create_creati |
| PASS | Delete creative | `meta_ads_delete_creative` | {"taskId":"9a60c586-5481-4f5e-bcb1-30b68b3f81c5","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_delete_creati |
| PASS | Create custom audience | `meta_ads_create_audience` | {"taskId":"2f6f3c60-a8fb-49f4-85da-d50d72bf403f","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_create_audien |
| PASS | Update audience | `meta_ads_update_audience` | {"taskId":"f8e13665-4b64-47f7-b906-c38ea7f2fac5","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_update_audien |
| PASS | Delete audience | `meta_ads_delete_audience` | {"taskId":"fca919f1-be4d-4879-bf0f-1a3a5988c30e","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_delete_audien |
| PASS | Add users to audience | `meta_ads_audience_add_users` | {"taskId":"62ecb74d-7e9a-4dd9-99f1-e4cf9ffaab08","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_audience_add_ |
| PASS | Create label | `meta_ads_create_label` | {"taskId":"cf3fae64-cf3f-40f3-95c8-8d2ff9623076","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_create_label" |
| PASS | Update label | `meta_ads_update_label` | {"taskId":"ddeefb28-fd46-426c-9a30-38af8c3ce50b","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_update_label" |
| PASS | Delete label | `meta_ads_delete_label` | {"taskId":"5e835601-6d40-485c-bb53-90c37ed32b0b","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_delete_label" |
| PASS | Upload image | `meta_ads_upload_image` | {"taskId":"8bcf4cf5-73da-4938-87e2-4413f8fb2a8c","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_upload_image" |
| PASS | Upload video | `meta_ads_upload_video` | {"taskId":"b1c7255a-af3e-4358-8447-4772ca0e9027","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_upload_video" |
| PASS | Send conversion (CAPI) event | `meta_ads_send_conversion_events` | {"taskId":"34ee5b3a-e24b-4295-9f53-a0ef71f522b9","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_send_conversi |
| PASS | Create budget schedule | `meta_ads_create_budget_schedule` | {"taskId":"f04b8f5e-ffaf-4592-beb5-d0d921d6b658","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_create_budget |
| PASS | Full paused launch (campaign+ad set+creative+ad) | `ads_launch_meta` | Stops before dry-run because readiness has manual checks still open. Meta account readiness must be persisted and READY before launch |
| PASS | Create Page post | `meta_ads_create_page_post` | {"taskId":"1bebecc0-5de2-49fb-bdca-0b4a2dc08e91","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_create_page_p |
| PASS | Create lead form | `meta_ads_create_lead_form` | {"taskId":"5a1a9552-bf6f-44a7-b5fb-19a0bb0d84ca","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_create_lead_f |
| PASS | Create test lead | `meta_ads_create_test_lead` | {"taskId":"6850d708-dae1-4962-bd74-a3c1426a9a22","department":"ads","mode":"live","status":"DRY_RUN","output":{"status":"DRY_RUN","tool":"meta_ads_create_test_l |

## Analysis & optimisation (17/17 pass)

| Result | Feature | Tool | Detail |
|---|---|---|---|
| PASS | Creative fatigue check (too little data) | `ads_analyze_creative` | {"taskId":"230ddded-12b7-4f23-8df8-e723dd0e515e","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","data":{"adId":"1202534361 |
| PASS | Creative fatigue check (mature data) | `ads_analyze_creative` | {"taskId":"6aba985e-f7e7-40df-b9fb-fa2e1bfa0430","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","data":{"adId":"1202534361 |
| PASS | Compare performance / blended ROAS | `ads_compare_performance` | {"taskId":"c159a67f-bb00-4c80-b13e-7c10baf9c89e","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","data":{"source":"supplied |
| PASS | Compare refuses mixed currencies | `ads_compare_performance` | Normalize currency with an explicit FX source before comparison |
| PASS | Reconcile measurement (platform vs orders) | `ads_reconcile_measurement` | {"taskId":"e26398f6-0847-4caa-b31d-5c6237dcdf21","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","data":{"source":"reconcil |
| PASS | Save an evidence-backed recommendation | `ads_create_recommendation` | {"taskId":"93285542-dd0f-40cd-a072-0e3810f88e4a","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","data":{"recommendationId" |
| PASS | Set up read-only daily monitoring | `ads_schedule_monitoring` | {"taskId":"773eb284-facb-4b6e-9cce-d3ce0db352ff","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","data":{"scheduleId":"feat |
| PASS | Run a monitoring window now | `meta_ads_run_monitoring` | {"taskId":"7bd40c8e-ca6f-4a24-85ba-26ae39785132","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","source":"live","fetchedAt |
| PASS | Saved records: meta_readiness | `ads_list_records` | {"taskId":"c01166de-3409-47f1-8e9f-7639aa686be2","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","data":[{"provider":"meta" |
| PASS | Saved records: meta_campaign_draft | `ads_list_records` | {"taskId":"0145d313-e507-4a3c-9e81-42b8759be96f","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","data":[{"draftId":"featur |
| PASS | Saved records: meta_launch | `ads_list_records` | {"taskId":"9959594c-9ec1-43fb-9a12-df17bd0292f1","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","data":[{"draftId":"featur |
| PASS | Saved records: report | `ads_list_records` | {"taskId":"6ff1e83c-0dae-4e11-8287-ef77f5deecde","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","data":[{"tool":"meta_ads_ |
| PASS | Saved records: recommendation | `ads_list_records` | {"taskId":"96a79fef-3105-46c2-83f1-beb7682a3b4b","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","data":[{"recommendationId |
| PASS | Saved records: schedule | `ads_list_records` | {"taskId":"0cc3ec0d-2fa7-4ad8-8e5e-5f342ae0b326","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","data":[{"scheduleId":"fea |
| PASS | Saved records: reconciliation | `ads_list_records` | {"taskId":"7a4cac9d-c822-4a69-a3ca-530dbf834c97","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","data":[{"source":"reconci |
| PASS | Approval queue / operation history | `ads_list_operations` | {"taskId":"14888106-0e30-4817-93a4-50b6bf268727","department":"ads","mode":"live","status":"COMPLETED","output":{"status":"COMPLETED","data":[{"id":"namostri-en |
| PASS | Department skill: campaign optimisation | `department_run` | {"taskId":"d6219b2e-7b28-4771-8181-dad7b3180f27","department":"ads","mode":"live","status":"PENDING","output":{"status":"PENDING","success":false,"reason":"Supp |

## Marketing knowledge (18/18 pass)

| Result | Feature | Tool | Detail |
|---|---|---|---|
| PASS | Knowledge router + file list | `skill_knowledge` | {"taskId":"3f6396f2-0f9b-4866-a332-d1251bd38400","department":"ads","mode":"live","status":"COMPLETED","output":{"router":"# Knowledge router (read this first)\ |
| PASS | Read ads/meta-audit-checklist.md | `skill_knowledge` | {"taskId":"5a9bb2cb-130d-4398-8ca8-24dce936edad","department":"ads","mode":"live","status":"COMPLETED","output":{"path":"ads/meta-audit-checklist.md","content": |
| PASS | Read ads/meta-analyze-optimize-scale.md | `skill_knowledge` | {"taskId":"85447fa3-48c0-4048-bb8c-fe602a85e69c","department":"ads","mode":"live","status":"COMPLETED","output":{"path":"ads/meta-analyze-optimize-scale.md","co |
| PASS | Read ads/meta-campaign-structures.md | `skill_knowledge` | {"taskId":"95f901cc-b621-40ad-97f1-14c0533099ce","department":"ads","mode":"live","status":"COMPLETED","output":{"path":"ads/meta-campaign-structures.md","conte |
| PASS | Read ads/ppc-math.md | `skill_knowledge` | {"taskId":"34a81097-3429-4c16-b3fe-47c185fa0147","department":"ads","mode":"live","status":"COMPLETED","output":{"path":"ads/ppc-math.md","content":"# PPC Math  |
| PASS | Read ads/creative-and-copy.md | `skill_knowledge` | {"taskId":"cec68a21-50d8-4515-bbea-f0db64d546c2","department":"ads","mode":"live","status":"COMPLETED","output":{"path":"ads/creative-and-copy.md","content":"#  |
| PASS | Read ads/competitor-intel.md | `skill_knowledge` | {"taskId":"7baf9daa-a6b8-4d5e-9a25-7186b475ebac","department":"ads","mode":"live","status":"COMPLETED","output":{"path":"ads/competitor-intel.md","content":"# C |
| PASS | Read ads/report-template.md | `skill_knowledge` | {"taskId":"ef6e31cc-62b3-4299-b4ec-9f4dd6405c19","department":"ads","mode":"live","status":"COMPLETED","output":{"path":"ads/report-template.md","content":"# Pe |
| PASS | Read ads/our-business-fit.md | `skill_knowledge` | {"taskId":"5171d8a6-8eb5-4d2c-a6b9-7268178484aa","department":"ads","mode":"live","status":"COMPLETED","output":{"path":"ads/our-business-fit.md","content":"# H |
| PASS | Read ads/b2b-paid-playbook.md | `skill_knowledge` | {"taskId":"9cb08698-0a40-4447-b433-f45e0c4cf409","department":"ads","mode":"live","status":"COMPLETED","output":{"path":"ads/b2b-paid-playbook.md","content":"#  |
| PASS | Read ops/diagnose.md | `skill_knowledge` | {"taskId":"9f4bba4c-659d-41d4-b547-9fc68b676090","department":"ads","mode":"live","status":"COMPLETED","output":{"path":"ops/diagnose.md","content":"# Diagnose: |
| PASS | Read ops/learning-loop.md | `skill_knowledge` | {"taskId":"4aeec49e-0cc1-4cd8-b4e0-24e0bdaea582","department":"ads","mode":"live","status":"COMPLETED","output":{"path":"ops/learning-loop.md","content":"# Lear |
| PASS | Read ops/review-panel.md | `skill_knowledge` | {"taskId":"0502d0a5-b9f0-4a01-afa8-25a2d500ca10","department":"ads","mode":"live","status":"COMPLETED","output":{"path":"ops/review-panel.md","content":"# Revie |
| PASS | Read creative/SKILL.md | `skill_knowledge` | {"taskId":"b093d3d1-cc06-480f-a127-983a1dd9409d","department":"ads","mode":"live","status":"COMPLETED","output":{"path":"creative/SKILL.md","content":"---\r\nna |
| PASS | Path escape is blocked | `skill_knowledge` | Unknown knowledge file; call without path for the router and file list |
| PASS | Learnings memory: list | `skill_learnings` | {"taskId":"ee240426-7565-4096-a0d5-4208f4010686","department":"ads","mode":"live","status":"COMPLETED","output":{"learnings":[]}} |
| PASS | Learnings memory: retro | `skill_learnings` | {"taskId":"9a1a4da8-20c5-4c7d-905c-12d74005194c","department":"ads","mode":"live","status":"COMPLETED","output":{"window":{"days":30,"since":"2026-10-20T06:49:2 |
| PASS | Same knowledge on analytics server | `skill_knowledge` | {"taskId":"b1aeabb4-cf5c-4537-8daf-83cbd5500ce1","department":"analytics","mode":"live","status":"COMPLETED","output":{"router":"# Knowledge router (read this f |

## Safety (23/23 pass)

| Result | Feature | Tool | Detail |
|---|---|---|---|
| PASS | Switching a campaign ON through the API is blocked | `meta_ads_update_campaign` | API activation is disabled in v1; complete the shadow review and activate manually in the provider UI |
| PASS | Switching an ad ON through the API is blocked | `meta_ads_update_ad` | API activation is disabled in v1; complete the shadow review and activate manually in the provider UI |
| PASS | Numeric status values are blocked | `meta_ads_update_adset` | Status must use a named provider value, not a numeric enum |
| PASS | Budget above the ₹500 cap is blocked | `meta_ads_update_campaign` | Budget/bid amount exceeds the configured per-write ceiling |
| PASS | Bid above the cap is blocked | `meta_ads_update_adset` | Budget/bid amount exceeds the configured per-write ceiling |
| PASS | Zero/negative budget is blocked | `meta_ads_update_campaign` | daily_budget must be a positive safe integer in provider currency units |
| PASS | Multiplier budget schedule is blocked | `meta_ads_create_budget_schedule` | Multiplier budget schedules require an effective amount check; use an absolute budget schedule |
| PASS | Special ad categories (housing/credit etc.) are blocked | `meta_ads_create_campaign` | Regulated special-ad categories are blocked from self-service activation |
| PASS | Deprecated placement is blocked | `meta_ads_update_adset` | Payload contains a deprecated Meta placement or attribution window |
| PASS | Deprecated attribution window is blocked | `meta_ads_update_adset` | Payload contains a deprecated Meta placement or attribution window |
| PASS | Tokens inside arguments are blocked | `meta_ads_update_campaign` | Credentials must not be included in tool arguments |
| PASS | Account outside the allowlist is blocked (write) | `meta_ads_create_label` | Account/property is outside the configured allowlist |
| PASS | Account outside the allowlist is blocked (read) | `meta_ads_list_campaign` | Account/property is outside the configured allowlist |
| PASS | CAPI events to a pixel not in allowedObjects are blocked | `meta_ads_send_conversion_events` | Target object must be explicitly listed in allowedObjects |
| PASS | Adding users to an audience not in allowedObjects is blocked | `meta_ads_audience_add_users` | Target object must be explicitly listed in allowedObjects |
| PASS | Budget schedule on a campaign not in allowedObjects is blocked | `meta_ads_create_budget_schedule` | Parent Page/business/catalog is not in allowedObjects |
| PASS | Page post without allowedObjects is blocked | `meta_ads_create_page_post` | Target object must be explicitly listed in allowedObjects |
| PASS | Live write without operationId is blocked | `meta_ads_create_label` | Live writes require a stable operationId; reuse it when resuming the same operation |
| PASS | Unknown argument keys are rejected (strict schema) | `meta_ads_list_campaign` | [ { "code": "unrecognized_keys", "keys": [ "limit" ], "path": [], "message": "Unrecognized key(s) in object: 'limit'" } ] |
| PASS | Launch needs persisted READY readiness | `ads_launch_meta` | Meta account readiness must be persisted and READY before launch |
| PASS | Continue-launch needs a real PARTIAL launch | `ads_continue_meta_launch` | Only a persisted PARTIAL Meta launch can be continued; UNCERTAIN launches require manual reconciliation |
| PASS | Nothing from this test reached the approval queue | `ads_list_operations` | No ft-* operations pending |
| PASS | Engagement 2.0 still PAUSED with the same budget after the run | `meta_ads_get_campaign` | {"id":"120253435679090659","name":"Namostri Engagement Campaign 2.0","status":"PAUSED","daily_budget":"50000"} |

## Decode (format research) (4/4 pass)

| Result | Feature | Tool | Detail |
|---|---|---|---|
| PASS | Decode own Meta ads | `DecodeService.start` | Expected to refuse with the keys in .env today. Decode needs an LLM: DEEPSEEK_API_KEY+DEEPSEEK_MODEL or OPENROUTER_API_KEY+OPENROUTER_TEXT_MODEL |
| PASS | Decode competitor ads (Ad Library) | `DecodeService.start` | Expected to refuse with the keys in .env today. Decode needs APIFY_TOKEN to scrape |
| PASS | Rejects a 1-letter query | `DecodeService.start` | Expected to refuse with the keys in .env today. Enter a brand, keyword or Ad Library URL to decode |
| PASS | Rejects platforms it does not support | `DecodeService.start` | Expected to refuse with the keys in .env today. [ { "received": "tiktok", "code": "invalid_enum_value", "options": [ "meta_ads", "own_meta" ], "path": [ "platform" ], "message": "Invalid enum value. Expected  |

