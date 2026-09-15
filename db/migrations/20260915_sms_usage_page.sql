-- Settings → SMS usage counts this month's texts per business.

CREATE INDEX sms_usage_business_sent_idx ON sms_usage (business_id, sent_at);
