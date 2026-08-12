local cooldowns = {}

RegisterNetEvent('cortex_example:server:requestGreeting', function()
    local src = source
    local now = os.time()
    if cooldowns[src] and now - cooldowns[src] < 2 then return end
    cooldowns[src] = now
    TriggerClientEvent('cortex_example:client:greeting', src, ExampleConfig.greeting)
end)

AddEventHandler('playerDropped', function()
    cooldowns[source] = nil
end)
