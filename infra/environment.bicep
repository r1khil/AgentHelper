targetScope = 'resourceGroup'
param location string = 'eastus'
param appName string = 'agenthelper-dev'
param environmentName string = '${appName}-env'
resource environment 'Microsoft.App/managedEnvironments@2025-01-01' = {
  name: environmentName
  location: location
  tags: { project: 'agenthelper', environment: 'development' }
  properties: {
    workloadProfiles: [{ name: 'Consumption', workloadProfileType: 'Consumption' }]
    appLogsConfiguration: {}
    zoneRedundant: false
  }
}
output appUrl string = 'https://${appName}.${environment.properties.defaultDomain}'
