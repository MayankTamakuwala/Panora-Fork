import { EnvironmentService } from '@@core/@core-services/environment/environment.service';
import { BullQueueModule } from '@@core/@core-services/queues/queue.module';
import { WebhookModule } from '@@core/@core-services/webhooks/panora-webhooks/webhook.module';
import { WebhookService } from '@@core/@core-services/webhooks/panora-webhooks/webhook.service';
import { ConnectionsStrategiesService } from '@@core/connections-strategies/connections-strategies.service';
import { Module } from '@nestjs/common';
import { EcommerceConnectionsService } from './services/ecommerce.connection.service';
import { ServiceRegistry } from './services/registry.service';
import { ShopifyConnectionService } from './services/shopify/shopify.service';

@Module({
  imports: [WebhookModule, BullQueueModule],
  providers: [
    EcommerceConnectionsService,
    WebhookService,
    EnvironmentService,
    ServiceRegistry,
    ConnectionsStrategiesService,
    //PROVIDERS SERVICES,
    ShopifyConnectionService,
  ],
  exports: [EcommerceConnectionsService],
})
export class EcommerceConnectionModule {}
