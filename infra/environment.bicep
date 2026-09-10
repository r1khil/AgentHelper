targetScope = 'resourceGroup'
resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: 'agenthelper-dev-env'
  location: 'eastus'
  tags: { project: 'agenthelper', environment: 'development' }
  properties: {
    workloadProfiles: [{ name: 'Consumption', workloadProfileType: 'Consumption' }]
    appLogsConfiguration: {}
    zoneRedundant: false
  }
}
output appUrl string = 'https://agenthelper-dev.${environment.properties.defaultDomain}'
