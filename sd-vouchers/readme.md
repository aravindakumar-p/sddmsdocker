# Vendor Partner Program Vouchers API
## API Documentation
> POST: /vpp/get-vouchers
```
AIM: To get specified voucher from the best vendor.
REQUEST: 
{
	"required_vouchers": [
		 {
			 "sku": "SDSWIG00100",
			 "qty": 1,
			 "amt": 100
		 }
	],
    "options": {
        "redeemed": true,
        "reference_id": "SDSWIG00100-1000-qwewretryc",
        "order_id": "<LINK_ID> or <SD_STORE_ID>",
        // If true, then for the error,please provide uniq ref if from Workadvantage,
        // The Api will automatically pick up from order history api and provide 
        "retrieveIfRedeemed": true or false
        "extra": { 
            "client": "<CLIENT_ID>"
        }
    }
}

SUCCESS RESPONSE:
[
    {
        "success": true,
        "message": "",
        "keys": [
            7199
        ],
        "exception": false,
        "response": [
            {
                "code": "DAjREIgb8lOiFeM5",
                "pin": "UBDBLS",
                "expiry": "2024-04-29T08:25:00.000Z"
            }
        ]
    }
]

FAILURE RESPONSE:
success will be false,
exception might or might not be true based on if error/exception occurred in api
```
> POST: /vpp/get-old-vouchers
```
AIM: To get previous order Details
REQUEST:
{
	"vendor_code": "WK_ADV",
    "reference_id": "SDSWIG00100-1000-qwewretrycx",
    "options": {
        "store_to_inventory": true,
        "reorder_if_not_in_history": true,
        "redeemed": true,
        "order_id": "sdvdfv",
        "extra": { 
            "client": "sadafesd"
        }
    }
}

SUCCESS RESPONSE:
{
    "success": true,
    "message": "",
    "keys": [
        8911
    ],
    "exception": false,
    "response": [
        {
            "code": "XXXX",
            "pin": "XXXX",
            "expiry": "2024-04-29T08:25:00.000Z"
        }
    ]
}

FAILURE RESPONSE:
{
    "success": false,
    "message": "",
    "keys": null,
    "exception": false,
    "response": []
}
```

> POST: /vpp/place-new-order
```
AIM: To place order from a specific vendor and not by ranking.
REQUEST:
{
	"vendor_code": "WK_ADV",
    "reference_id": "SDSWIG00100-1000-qwewretrycx",
    "brand_sku": "SDSWIG00100",
    "quantity": 1,
    "options": {
        "redeemed": true,
        "order_id": "sdvdfv",
        "extra": { 
            "client": "sadafesdkjk"
        }
    }
}

SUCCESS RESPONSE:


FAILURE RESPONSE:
{
    "success": false,
    "message": "We don't have requested numbers of Coupons. We have 0 for selected deal",
    "keys": null,
    "exception": false,
    "response": []
}
```

> GET: /get-catalog/:id/:countryCode
```
AIM: To generate and download catalog of a vendor based on country code.
here :id is vendor code for example WK_ADV
```

> GET: /get-balance/:id
```
AIM: To get the wallet balance of a particular vendor
```

