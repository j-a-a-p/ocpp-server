def register(event_handler):
    """ Registers the SetChargingProfile event handler. """

    @event_handler.cp.on("SetChargingProfile")
    async def on_set_charging_profile(connector_id, cs_charging_profiles, **kwargs):
        return await event_handler.charging_profile_manager.apply_profile(connector_id, cs_charging_profiles)