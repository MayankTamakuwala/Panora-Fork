import { LoggerService } from '@@core/@core-services/logger/logger.service';
import { PrismaService } from '@@core/@core-services/prisma/prisma.service';
import { CategoryConnectionRegistry } from '@@core/@core-services/registries/connections-categories.registry';
import { ApiKeyAuthGuard } from '@@core/auth/guards/api-key.guard';
import { JwtAuthGuard } from '@@core/auth/guards/jwt-auth.guard';
import { CoreSyncService } from '@@core/sync/sync.service';
import { ApiGetArrayCustomResponse } from '@@core/utils/dtos/openapi.respone.dto';
import { ConnectionsError } from '@@core/utils/errors';
import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiExcludeController,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthStrategy, CONNECTORS_METADATA } from '@panora/shared';
import { Response } from 'express';
import { Connection } from './@utils/types';

export type StateDataType = {
  projectId: string;
  vertical: string;
  linkedUserId: string;
  providerName: string;
  returnUrl?: string;
  [key: string]: any;
};

export class BodyDataType {
  apikey: string;
  [key: string]: any;
}

@ApiTags('connections')
@Controller('connections')
export class ConnectionsController {
  constructor(
    private categoryConnectionRegistry: CategoryConnectionRegistry,
    private coreSync: CoreSyncService,
    private logger: LoggerService,
    private prisma: PrismaService,
  ) {
    this.logger.setContext(ConnectionsController.name);
  }

  @ApiOperation({
    operationId: 'handleOAuthCallback',
    summary: 'Capture oAuth callback',
  })
  @ApiQuery({ name: 'state', required: true, type: String })
  @ApiQuery({ name: 'code', required: true, type: String })
  @ApiResponse({ status: 200 })
  @ApiExcludeEndpoint()
  @Get('oauth/callback')
  async handleOAuthCallback(@Res() res: Response, @Query() query: any) {
    try {
      const { state, code, ...otherParams } = query;
      if (!code) {
        throw new ConnectionsError({
          name: 'OAUTH_CALLBACK_CODE_NOT_FOUND_ERROR',
          message: `No Callback Params found for code, found ${code}`,
        });
      }

      if (!state) {
        throw new ConnectionsError({
          name: 'OAUTH_CALLBACK_STATE_NOT_FOUND_ERROR',
          message: `No Callback Params found for state, found ${state}`,
        });
      }

      const stateData: StateDataType = JSON.parse(decodeURIComponent(state));
      const {
        projectId,
        vertical,
        linkedUserId,
        providerName,
        returnUrl,
        resource,
      } = stateData;

      const service = this.categoryConnectionRegistry.getService(
        vertical.toLowerCase(),
      );
      await service.handleCallBack(
        providerName,
        { linkedUserId, projectId, code, otherParams, resource },
        'oauth2',
      );
      if (providerName == 'shopify') {
        // we must redirect using shop and host to get a valid session on shopify server
        service.redirectUponConnection(res, otherParams);
      } else {
        res.redirect(returnUrl);
      }
      if (
        CONNECTORS_METADATA[vertical.toLowerCase()][providerName.toLowerCase()]
          .active !== false
      ) {
        this.logger.log('triggering initial core sync for all objects...;');
        // Performing Core Sync Service for active connectors
        await this.coreSync.initialSync(
          vertical.toLowerCase(),
          providerName,
          linkedUserId,
        );
      }
    } catch (error) {
      throw error;
    }
  }

  /*@Get('/gorgias/oauth/install')
  handleGorgiasAuthUrl(
    @Res() res: Response,
    @Query('account') account: string,
    @Query('response_type') response_type: string,
    @Query('nonce') nonce: string,
    @Query('scope') scope: string,
    @Query('client_id') client_id: string,
    @Query('redirect_uri') redirect_uri: string,
    @Query('state') state: string,
  ) {
    try {
      console.log(client_id)
      if (!account) throw new ReferenceError('account prop not found');
      const params = `?client_id=${client_id}&response_type=${response_type}&redirect_uri=${redirect_uri}&state=${state}&nonce=${nonce}&scope=${scope}`;
      res.redirect(`https://${account}.gorgias.com/oauth/authorize${params}`);
    } catch (error) {
      throw error;
    }
  }*/

  @ApiOperation({
    operationId: 'handleApiKeyCallback',
    summary: 'Capture api key or basic auth callback',
  })
  @ApiExcludeEndpoint()
  @ApiQuery({ name: 'state', required: true, type: String })
  @ApiBody({ type: BodyDataType })
  @ApiResponse({ status: 201 })
  @Post('basicorapikey/callback')
  async handleApiKeyCallback(
    @Res() res: Response,
    @Query() query: any,
    @Body() body: BodyDataType,
  ) {
    try {
      const { state } = query;
      if (!state) {
        throw new ConnectionsError({
          name: 'API_CALLBACK_STATE_NOT_FOUND_ERROR',
          message: `No Callback Params found for state, found ${state}`,
        });
      }
      const stateData: StateDataType = JSON.parse(decodeURIComponent(state));
      const { projectId, vertical, linkedUserId, providerName } = stateData;

      const { apikey, ...body_data } = body;
      const strategy =
        CONNECTORS_METADATA[vertical.toLowerCase()][providerName.toLowerCase()]
          .authStrategy.strategy;

      const body_ =
        strategy == AuthStrategy.api_key
          ? {
              projectId,
              linkedUserId,
              apikey,
              body_data,
            }
          : {
              projectId,
              linkedUserId,
              body_data,
            };
      const strategy_type =
        strategy == AuthStrategy.api_key ? 'apikey' : 'basic';

      const service = this.categoryConnectionRegistry.getService(
        vertical.toLowerCase(),
      );
      await service.handleCallBack(providerName, body_, strategy_type);
      /*if (
        CONNECTORS_METADATA[vertical.toLowerCase()][providerName.toLowerCase()]
          .active !== false
      ) {
        this.logger.log('triggering initial core sync for all objects...;');
        // Performing Core Sync Service for active connectors
        await this.coreSync.initialSync(
          vertical.toLowerCase(),
          providerName,
          linkedUserId,
        );
      }*/
      res.redirect(`/`);
    } catch (error) {
      throw error;
    }
  }

  @ApiOperation({
    operationId: 'getConnections',
    summary: 'List Connections',
  })
  @ApiExcludeEndpoint()
  @ApiResponse({ status: 200 })
  @UseGuards(JwtAuthGuard)
  @Get('internal')
  async list_internal(@Request() req: any) {
    try {
      const { id_project } = req.user;
      return await this.prisma.connections.findMany({
        where: {
          id_project: id_project,
        },
      });
    } catch (error) {
      throw error;
    }
  }

  @ApiOperation({
    operationId: 'getConnections',
    summary: 'List Connections',
  })
  @ApiGetArrayCustomResponse(Connection)
  @UseGuards(ApiKeyAuthGuard)
  @Get()
  async list(@Request() req: any) {
    try {
      const { id_project } = req.user;
      return await this.prisma.connections.findMany({
        where: {
          id_project: id_project,
        },
      });
    } catch (error) {
      throw error;
    }
  }
}
