import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectPhotoQuery } from './photo-query';
import { deferred, initialData, photo, response } from '../../../test/photo-fixtures';

const fetchMock = jest.fn<typeof fetch>();
const originalFetch = globalThis.fetch;
beforeEach(() => { globalThis.fetch = fetchMock; fetchMock.mockReset(); });
afterEach(() => { globalThis.fetch = originalFetch; });
const deleteButton = () => screen.getByRole('button', { name: `Delete ${photo.originalName}` });
const newFile = () => new File(['png content'], 'new.png', { type: 'image/png' });
function selectFile() {
  fireEvent.change(screen.getByLabelText('Choose photo'), { target: { files: [newFile()] } });
}

describe('Project photo interactions', () => {
  it('uses server initial data without a duplicate GET and cancels without a DELETE', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ProjectPhotoQuery initialData={initialData} />);
    await userEvent.click(deleteButton());
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining(photo.originalName));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(deleteButton()).toBeEnabled();
  });

  it('keeps the card during deletion and blocks upload until reconciliation finishes', async () => {
    const pending = deferred<Response>();
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    fetchMock.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response(200, { ...initialData, photos: [] }));
    render(<ProjectPhotoQuery initialData={initialData} />);
    selectFile();
    await userEvent.click(deleteButton());
    expect(deleteButton()).toHaveTextContent('Deleting');
    expect(screen.getByRole('heading', { name: photo.originalName })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Upload photo' })).toBeDisabled();
    await act(async () => { pending.resolve(response(204)); });
    await screen.findByText(`Deleted ${photo.originalName}.`);
    expect(screen.queryByRole('heading', { name: photo.originalName })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload photo' })).toBeEnabled();
  });

  it('blocks deletion for the complete upload and list refresh', async () => {
    const pending = deferred<Response>();
    const refresh = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise).mockReturnValueOnce(refresh.promise);
    render(<ProjectPhotoQuery initialData={initialData} />);
    selectFile();
    await userEvent.click(screen.getByRole('button', { name: 'Upload photo' }));
    expect(deleteButton()).toBeDisabled();
    await act(async () => { pending.resolve(response(201)); });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(deleteButton()).toBeDisabled();
    await act(async () => { refresh.resolve(response(200, initialData)); });
    await screen.findByText('Photo uploaded.');
    expect(deleteButton()).toBeEnabled();
  });

  it('keeps a card on ambiguous deletion and requires a successful refresh', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    fetchMock.mockRejectedValueOnce(new TypeError('Network lost'))
      .mockResolvedValueOnce(response(503)).mockResolvedValueOnce(response(200, initialData));
    render(<ProjectPhotoQuery initialData={initialData} />);
    await userEvent.click(deleteButton());
    await screen.findByText(/deletion result could not be confirmed/);
    expect(deleteButton()).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Refresh after deletion' }));
    await screen.findByText('The photos could not be refreshed. Try again before deleting.');
    expect(deleteButton()).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh after deletion' }));
    await screen.findByText('Photos refreshed. Check the list before deleting again.');
    expect(deleteButton()).toBeEnabled();
  });

  it('does not restore a confirmed deleted card when the follow-up query fails', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    fetchMock.mockResolvedValueOnce(response(204)).mockResolvedValueOnce(response(503));
    render(<ProjectPhotoQuery initialData={initialData} />);
    await userEvent.click(deleteButton());
    await screen.findByText(/Photo deleted, but the list could not be refreshed/);
    expect(screen.queryByRole('heading', { name: photo.originalName })).not.toBeInTheDocument();
  });
});


describe('Upload validation and recovery', () => {
  it('rejects invalid selection before any request', () => {
    render(<ProjectPhotoQuery initialData={initialData} />);
    fireEvent.change(screen.getByLabelText('Choose photo'), { target: { files: [new File(['text'], 'notes.txt', { type: 'text/plain' })] } });
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a JPG or PNG photo.');
    expect(screen.getByRole('button', { name: 'Upload photo' })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves the selection after a definite rejection and allows a retry', async () => {
    fetchMock.mockResolvedValueOnce(response(415));
    render(<ProjectPhotoQuery initialData={initialData} />);
    selectFile();
    await userEvent.click(screen.getByRole('button', { name: 'Upload photo' }));
    await screen.findByText('The file content must be a JPG or PNG photo.');
    expect(screen.getByText('new.png')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Upload photo' })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry an uncertain upload and blocks another until refresh succeeds', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network lost'))
      .mockResolvedValueOnce(response(503)).mockResolvedValueOnce(response(200, initialData));
    render(<ProjectPhotoQuery initialData={initialData} />);
    selectFile();
    await userEvent.click(screen.getByRole('button', { name: 'Upload photo' }));
    await screen.findByText(/upload result could not be confirmed/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Upload photo' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh photos' }));
    await screen.findByText(/Try refreshing again before uploading/);
    expect(screen.getByRole('button', { name: 'Upload photo' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh photos' }));
    await screen.findByText('Photos refreshed. Check the list before uploading again.');
    expect(screen.getByRole('button', { name: 'Upload photo' })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('reports confirmed upload separately from refresh failure and clears the selection', async () => {
    fetchMock.mockResolvedValueOnce(response(201)).mockResolvedValueOnce(response(503));
    render(<ProjectPhotoQuery initialData={initialData} />);
    selectFile();
    await userEvent.click(screen.getByRole('button', { name: 'Upload photo' }));
    await screen.findByText('Photo uploaded, but the list could not be refreshed. Refresh the photos to see it.');
    expect(screen.getByText('No file selected')).toBeVisible();
    expect(screen.getByRole('heading', { name: photo.originalName })).toBeVisible();
    expect(screen.queryByText('No photos yet')).not.toBeInTheDocument();
  });
});
