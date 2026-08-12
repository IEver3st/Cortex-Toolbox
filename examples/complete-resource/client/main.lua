RegisterNetEvent('cortex_example:client:greeting', function(message)
    if type(message) ~= 'string' or #message > 120 then return end
    print(message)
end)

RegisterCommand('cortex_example', function()
    TriggerServerEvent('cortex_example:server:requestGreeting')
end, false)
