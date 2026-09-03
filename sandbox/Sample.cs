namespace Sandbox;

/// <summary>
/// Scratch file for exercising KAT Comment Studio in the Extension Development Host.
/// Open this folder via the "Run Extension (Isolated)" launch configuration so the
/// dev host never reopens a large real workspace.
/// </summary>
public class Sample
{
	/// <summary>
	/// <para>The guided tasks this participant is entitled to.</para>
	/// xDS 'aiAgents' rows the site also has a definition for. Row presence *is* the entitlement — there is no separate
	/// enabled flag — so an agent absent from the table is invisible to the model, cannot be proposed, and cannot be
	/// started by slash command.
	///
	/// Resolved here rather than in AgentDefinitionLoader because that cache is static and keyed by site alone, with no
	/// user dimension.
	/// </summary>
	public string[] EntitledAgents { get; set; } = [];

	/// <summary>
	/// A short summary used to check that reflow leaves already-correct comments alone.
	/// </summary>
	/// <param name="value">The value to echo back to the caller.</param>
	/// <returns>The supplied <paramref name="value" />, unchanged.</returns>
	public string Echo(string value) => value;
}
