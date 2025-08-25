export type Options = {
	redeemed: boolean;
	order_id: string;
	extra: object;
	reference_id: string;
	retrieveIfRedeemed: boolean;
	syncOnly: boolean;
}

export type VoucherRequest = {
  sku: string;
  qty: string;
  cur: string;
  amt: number;
};

export type ParentRequest = {
	required_vouchers: VoucherRequest[];
	options: Options;
}

export type Voucher = {
	code: string;
	pin: string;
	expiry: any;
}

export type VoucherResponse = {
	success: boolean;
	exception: any;
	message: string;
	keys?: any | [];
	response: Voucher[],
	orderStatusFromVendor: any | string
	vendorCode: any | string
	statusCodeFromVendor: any | string
}

export type CatalogRequest = {
	vendor_api_int_id: string
}
