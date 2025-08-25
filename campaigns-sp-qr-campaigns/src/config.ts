export default {
	"collection": {
		"LOG_TABLE": "backend_logs",
		"PROJECTS": "projects",
		"CAMPAIGNS" : "sp_campaigns",
		"CAMPAIGN_USERS" : "sp_campaign_users",
		"CAMPAIGN_USER_CONVERSATIONS" : "sp_campaign_user_conversations",
		"CAMPAIGN_USER_CONVERSATION_DETAILS" : "sp_campaign_user_conversation_details",
		"REWARD_CAMPAIGN" : "sp_reward_campaigns",
		"REWARD_LINKS" : "sp_reward_links",
		"PROJECTLEDGER": "project_ledger"
	},
	"logging_system": {
		"save_normal_logs": true,
		"save_error_logs": true
	},
	"auth": {
		"extension": "Basic YzJoaGEyV1nDaV1dZdW1dD5As4F9y3P5eVwZUBkb9"
	},
	"workflows": {
		"base_url": process.env.WORKFLOW_BASE_URL,
		"sd_notifications_auth": process.env.WORKFLOW_AUTH,
	},
	"defaults": {
		"link_duration": 6,
		"reward_link_length": 16,
		"asset_base_url": process.env.ASSETS_BASE_URL,
		"base_url": process.env.PUBLIC_URL,
		"sc_inner_zoom": 1,
		"sc_height": 300,
		"sc_width": 300,
		"sc_border_thickness": "2px",
		"sc_border_radius":"10px",
		"sc_border_color": "#000",
		"sc_button_background":"rgba(229,213,255,0.94)",
		"sc_button_foreground": "#27263f",
		"sc_button_radius":"0px",
		"sc_inner_bg":"#c4deff",
		"sc_inner_text_color":"#003a79",
		"sc_button_height":"20px",
		"sc_button_text":"Apply",
		"sc_inner_image":"",
		"scratch_card": ""
	}
}
