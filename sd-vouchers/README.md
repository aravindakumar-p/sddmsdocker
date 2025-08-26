# SD Vouchers - Queue-Based Voucher Generation

This extension provides queue-based voucher generation functionality migrated from campaigns-reward-links.

## Features

- **Queue-based voucher generation** using BullMQ and Redis
- **Internal voucher generation logic** without external HTTP dependencies
- **Fallback mechanisms** for voucher availability
- **Comprehensive logging** with standardized LogSys format

## Queue Infrastructure

The queue system is located in `src/queue/` and includes:

### Files

- `redis.config.ts` - Redis connection configuration
- `voucherQueue.ts` - BullMQ queue setup and management
- `worker.ts` - Queue worker for processing voucher generation jobs

### Environment Variables

Set these environment variables for Redis configuration:

```bash
CACHE_REDIS_HOST=localhost
CACHE_REDIS_PORT=6379
CACHE_PASSWORD=your-redis-password
```

## Installation

1. Install dependencies:
```bash
npm install bullmq ioredis
```

2. Configure Redis connection in environment variables

3. Update `src/config.json` with your specific values:
   - `secret_key` - JWT secret key
   - `expiresIn` - Token expiration hours
   - `from_mail` - Email sender address
   - `custom_domain` - Your domain
   - `inventoryQty` - Minimum inventory quantity for direct links
   - `softlLinkInventoryQty` - Minimum inventory quantity for soft links

## Usage

### Queue-Based Voucher Generation

The `redeemVoucher` function now supports queue-based voucher generation:

```typescript
// For direct_link mode, uses queue-based generation
const voucherCode = await job.waitUntilFinished(queueEvents['voucher-fetch-queue']);

// For link mode, uses direct generation
const voucherCode = await get.voucherCode(sku);
```

### Manual Voucher Generation

Use the `generateVoucherBySkuBestVendor` function for manual voucher generation:

```typescript
const isGenerated = await generateVoucherBySkuBestVendor(
    sku,
    voucherValue,
    bestVendor,
    quantity,
    referenceId,
    getters,
    setters
);
```

## Queue Worker

The worker processes voucher generation jobs:

1. **Checks inventory** for available vouchers
2. **Generates from vendor** if inventory is low
3. **Updates voucher status** with redemption details
4. **Returns voucher data** or empty object if failed

## Logging

All operations use standardized LogSys logging:

```typescript
await new LogSys().log('Message', success, referenceId, vendorCode);
```

## Migration from campaigns-reward-links

This implementation includes:

- ✅ Full `generateVoucherBySkuBestVendor` function
- ✅ Queue infrastructure with Redis support
- ✅ Worker processing with internal logic
- ✅ Fallback mechanisms
- ✅ Comprehensive error handling
- ✅ Standardized logging format

## Dependencies

- `bullmq` - Queue management
- `ioredis` - Redis client
- `axios` - HTTP requests (if needed)
- `crypto-js` - Encryption utilities

## Configuration

Update `src/config.json` with your specific values:

```json
{
  "inventoryQty": 10,
  "softlLinkInventoryQty": 5,
  "secret_key": "your-secret-key",
  "expiresIn": 24,
  "from_mail": "noreply@yourdomain.com",
  "custom_domain": "https://yourdomain.com"
}
``` 