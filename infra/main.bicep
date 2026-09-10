targetScope = 'resourceGroup'
param location string = 'eastus'
param appName string = 'agenthelper-dev'
param image string
param registryUser string
@secure()
param registryPassword string
@secure()
param databaseUrl string
@secure()
param authSecret string
param entraTenantId string
param entraSubdomain string
param entraClientId string
@secure()
param entraClientSecret string
param workerEnabled bool = true
var tags = { project: 'agenthelper', environment: 'development' }
resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: '${appName}-env'
  location: location
  tags: tags
  properties: {
    workloadProfiles: [{ name: 'Consumption', workloadProfileType: 'Consumption' }]
    appLogsConfiguration: {}
    zoneRedundant: false
  }
}
var origin = 'https://${appName}.${environment.properties.defaultDomain}'
var secrets = [
  { name: 'database-url', value: databaseUrl }
  { name: 'auth-secret', value: authSecret }
  { name: 'entra-client-secret', value: entraClientSecret }
  { name: 'registry-password', value: registryPassword }
]
var env = [
  { name: 'DATABASE_URL', secretRef: 'database-url' }
  { name: 'AUTH_SECRET', secretRef: 'auth-secret' }
  { name: 'ENTRA_CLIENT_SECRET', secretRef: 'entra-client-secret' }
  { name: 'ENTRA_TENANT_ID', value: entraTenantId }
  { name: 'ENTRA_SUBDOMAIN', value: entraSubdomain }
  { name: 'ENTRA_CLIENT_ID', value: entraClientId }
  { name: 'APP_URL', value: origin }
  { name: 'AUTH_MODE', value: 'entra' }
]
resource web 'Microsoft.App/containerApps@2025-01-01' = {
  name: appName
  location: location
  tags: tags
  properties: {
    managedEnvironmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      activeRevisionsMode: 'Single'
      secrets: secrets
      registries: [{ server: 'ghcr.io', username: registryUser, passwordSecretRef: 'registry-password' }]
      ingress: { external: true, targetPort: 3000, transport: 'auto', allowInsecure: false }
    }
    template: {
      containers: [{
        name: 'web'
        image: image
        env: env
        resources: { cpu: json('0.25'), memory: '0.5Gi' }
        probes: [
          { type: 'Liveness', httpGet: { path: '/api/health', port: 3000 }, initialDelaySeconds: 10, periodSeconds: 30 }
          { type: 'Readiness', httpGet: { path: '/api/health', port: 3000 }, initialDelaySeconds: 5, periodSeconds: 10 }
        ]
      }]
      scale: { minReplicas: 0, maxReplicas: 1, rules: [{ name: 'http', http: { metadata: { concurrentRequests: '10' } } }] }
    }
  }
}
resource worker 'Microsoft.App/jobs@2025-01-01' = if (workerEnabled) {
  name: '${appName}-worker'
  location: location
  tags: tags
  properties: {
    environmentId: environment.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Schedule'
      replicaTimeout: 60
      replicaRetryLimit: 0
      scheduleTriggerConfig: { cronExpression: '0 12-22 * * 1-5', parallelism: 1, replicaCompletionCount: 1 }
      secrets: secrets
      registries: [{ server: 'ghcr.io', username: registryUser, passwordSecretRef: 'registry-password' }]
    }
    template: { containers: [{ name: 'worker', image: image, command: ['node', 'dist/worker.js'], env: env, resources: { cpu: json('0.25'), memory: '0.5Gi' } }] }
  }
}
output url string = origin
output webName string = web.name
output environmentName string = environment.name
